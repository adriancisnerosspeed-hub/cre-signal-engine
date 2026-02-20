import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";

export type Role = "free" | "owner" | "pro";

function isOwnerEmail(email: string | undefined): boolean {
  if (!email || !OWNER_EMAIL.trim()) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL.trim().toLowerCase();
}

/**
 * Server-side: ensure a profile exists for the user (e.g. on first login).
 * If no profile exists, creates one; sets role to 'owner' when user email matches OWNER_EMAIL.
 * Call this after auth (e.g. in auth callback).
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const role: Role = isOwnerEmail(user.email) ? "owner" : "free";
  await supabase.from("profiles").insert({ id: user.id, role });
}

/** Server-side: get current user's role from profiles. Returns null if not logged in. */
export async function getCurrentUserRole(): Promise<Role | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as Role | undefined;
  if (role && ["free", "owner", "pro"].includes(role)) return role;
  return "free";
}

/** Server-side: returns true if role can bypass rate limits (e.g. owner, pro). */
export function canBypassRateLimit(role: Role | null): boolean {
  return role === "owner" || role === "pro";
}

/** Server-side: returns true if role is allowed to use Pro features (e.g. analyze without strict limit). */
export function canUseProFeature(role: Role | null): boolean {
  return role === "owner" || role === "pro";
}
