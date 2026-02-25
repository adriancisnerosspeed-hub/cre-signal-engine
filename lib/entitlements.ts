import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "owner";

export type Entitlements = {
  plan: Plan;
  analyze_calls_per_day: number;
  deal_scans_per_day: number;
  digest_manual_send: boolean;
  digest_scheduled: boolean;
  email_digest_max_signals: number;
};

const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  analyze_calls_per_day: 10,
  deal_scans_per_day: 2,
  digest_manual_send: true,
  digest_scheduled: false,
  email_digest_max_signals: 6,
};

const PRO_ENTITLEMENTS: Entitlements = {
  plan: "pro",
  analyze_calls_per_day: 200,
  deal_scans_per_day: 50,
  digest_manual_send: true,
  digest_scheduled: true,
  email_digest_max_signals: 12,
};

const OWNER_ENTITLEMENTS: Entitlements = {
  plan: "owner",
  analyze_calls_per_day: 1000,
  deal_scans_per_day: 50,
  digest_manual_send: true,
  digest_scheduled: true,
  email_digest_max_signals: 12,
};

/** Server-only: get effective plan for user (from profiles.role). Owner bypass has all pro+ entitlements. */
export async function getPlanForUser(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data?.role as string) || "free";
  if (role === "owner" || role === "pro") return role as Plan;
  return "free";
}

/** Get entitlements for a plan. Owner gets highest limits. */
export function getEntitlements(plan: Plan): Entitlements {
  if (plan === "owner") return { ...OWNER_ENTITLEMENTS };
  if (plan === "pro") return { ...PRO_ENTITLEMENTS };
  return { ...FREE_ENTITLEMENTS };
}

/** Server-only: get plan then entitlements for a user. */
export async function getEntitlementsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlements> {
  const plan = await getPlanForUser(supabase, userId);
  return getEntitlements(plan);
}
