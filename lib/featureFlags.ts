import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TTL_MS = 60_000;

type FlagCacheEntry = { value: boolean; expiresAt: number };
const flagCache = new Map<string, FlagCacheEntry>();

type AllFlagsCache = {
  map: Map<string, boolean> | null;
  expiresAt: number;
};
const allFlagsCache: AllFlagsCache = { map: null, expiresAt: 0 };

function nowMs(): number {
  return Date.now();
}

/**
 * Returns whether a named feature flag is enabled.
 * Uses an in-memory TTL cache to avoid hammering `feature_flags` on hot paths.
 * Requires a Supabase client with permission to read `feature_flags` (e.g. service role on the server).
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagName: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<boolean> {
  const t = nowMs();
  const cached = flagCache.get(flagName);
  if (cached && cached.expiresAt > t) {
    return cached.value;
  }

  const { data, error } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("name", flagName)
    .maybeSingle();

  if (error || !data) {
    flagCache.set(flagName, { value: false, expiresAt: t + ttlMs });
    return false;
  }

  const value = Boolean(data.enabled);
  flagCache.set(flagName, { value, expiresAt: t + ttlMs });
  return value;
}

/**
 * Loads all feature flags as a name → enabled map (cached with TTL).
 */
export async function getAllFlags(
  supabase: SupabaseClient,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<Map<string, boolean>> {
  const t = nowMs();
  if (allFlagsCache.map && allFlagsCache.expiresAt > t) {
    return allFlagsCache.map;
  }

  const { data, error } = await supabase.from("feature_flags").select("name, enabled");

  if (error || !data) {
    const empty = new Map<string, boolean>();
    allFlagsCache.map = empty;
    allFlagsCache.expiresAt = t + ttlMs;
    return empty;
  }

  const map = new Map<string, boolean>();
  for (const row of data) {
    map.set(row.name, Boolean(row.enabled));
  }
  allFlagsCache.map = map;
  allFlagsCache.expiresAt = t + ttlMs;
  return map;
}

/** Clears in-memory caches (e.g. after owner updates a flag in the same process). */
export function clearFeatureFlagCache(): void {
  flagCache.clear();
  allFlagsCache.map = null;
  allFlagsCache.expiresAt = 0;
}
