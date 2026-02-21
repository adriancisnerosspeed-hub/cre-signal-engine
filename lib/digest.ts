import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_SIGNAL_TYPES = [
  "Pricing",
  "Credit Availability",
  "Credit Risk",
  "Liquidity",
  "Supply-Demand",
  "Policy",
  "Deal-Specific",
];

export const DEFAULT_ACTIONS = ["Act", "Monitor"];

export type DigestPreferences = {
  signal_types: string[];
  actions: string[];
  min_confidence: string;
};

export type UserPreferencesRow = DigestPreferences & {
  user_id: string;
  timezone: string;
  digest_time_local: string;
  digest_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export function getDefaultPreferences(): DigestPreferences & { timezone: string; digest_time_local: string; digest_enabled: boolean } {
  return {
    signal_types: [...DEFAULT_SIGNAL_TYPES],
    actions: [...DEFAULT_ACTIONS],
    min_confidence: "Medium",
    timezone: "America/Chicago",
    digest_time_local: "07:00",
    digest_enabled: true,
  };
}

export type DigestSignal = {
  id: number;
  idx: number;
  signal_type: string;
  action: string;
  confidence: string;
  what_changed: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  created_at: string;
};

const CONFIDENCE_RANK: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

export function getConfidenceRank(confidence: string): number {
  const c = (confidence || "").trim();
  return CONFIDENCE_RANK[c] ?? 0;
}

/**
 * Reusable digest query: last N hours of user's signals, filtered by preferences.
 * Future: can be extended to include global ingested signals.
 */
export async function getDigestSignals(
  supabase: SupabaseClient,
  options: {
    userId: string;
    windowHours: number;
    prefs: DigestPreferences;
  }
): Promise<DigestSignal[]> {
  const { userId, windowHours, prefs } = options;
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowHours * 60 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from("signals")
    .select("id, idx, signal_type, action, confidence, what_changed, why_it_matters, who_this_affects, created_at")
    .eq("user_id", userId)
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;

  const signals = (rows || []) as DigestSignal[];
  const typesSet = new Set((prefs.signal_types || []).map((s) => s.trim()));
  const actionsSet = new Set((prefs.actions || []).map((s) => s.trim()));
  const minRank = getConfidenceRank(prefs.min_confidence);

  return signals.filter((s) => {
    if (!typesSet.has((s.signal_type || "").trim())) return false;
    if (!actionsSet.has((s.action || "").trim())) return false;
    if (getConfidenceRank(s.confidence) < minRank) return false;
    return true;
  });
}

/** Group signals for display/email: by signal_type -> action -> items */
export function groupSignalsForDigest(signals: DigestSignal[]): Map<string, Map<string, DigestSignal[]>> {
  const byType = new Map<string, Map<string, DigestSignal[]>>();
  for (const s of signals) {
    const typeKey = s.signal_type || "Other";
    const actionKey = s.action || "Monitor";
    if (!byType.has(typeKey)) byType.set(typeKey, new Map());
    const byAction = byType.get(typeKey)!;
    if (!byAction.has(actionKey)) byAction.set(actionKey, []);
    byAction.get(actionKey)!.push(s);
  }
  return byType;
}
