import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Email that receives platform_admin role (full Enterprise workspace entitlements, fixture access, etc.).
 * Set OWNER_EMAIL in .env to your email so you always have Enterprise as platform admin.
 */
export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";

/** Platform roles only. Entitlements from workspace plan; bypass only for platform_admin. */
export type Role = "platform_admin" | "platform_dev" | "platform_support" | "user";

/** True when email matches `OWNER_EMAIL` (case-insensitive). Safe to use in server components and API routes. */
export function isOwner(email: string | undefined): boolean {
  if (!email || !OWNER_EMAIL.trim()) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL.trim().toLowerCase();
}

const ALLOWED_ROLES: Role[] = ["platform_admin", "platform_dev", "platform_support", "user"];

/**
 * Server-side: ensure a profile exists for the user (e.g. on first login).
 * When user email matches OWNER_EMAIL, sets or updates role to 'platform_admin' so you get
 * Enterprise workspace role (invites, policies, benchmark, etc.) via getWorkspacePlanAndEntitlementsForUser.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  const shouldBePlatformAdmin = isOwner(user.email);

  if (existing) {
    if (shouldBePlatformAdmin && existing.role !== "platform_admin") {
      await supabase.from("profiles").update({ role: "platform_admin" }).eq("id", user.id);
    }
    return;
  }

  const role: Role = shouldBePlatformAdmin ? "platform_admin" : "user";
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
  if (role && ALLOWED_ROLES.includes(role)) return role;
  return "user";
}

/** Server-side: returns true if role can bypass rate limits (platform_admin only). */
export function canBypassRateLimit(role: Role | null): boolean {
  return role === "platform_admin";
}

/** Server-side: returns true if role is allowed to use Pro features (platform_admin only). */
export function canUseProFeature(role: Role | null): boolean {
  return role === "platform_admin";
}
