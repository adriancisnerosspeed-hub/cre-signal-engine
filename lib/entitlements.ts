import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "platform_admin";

/**
 * Result of getPlanForUser: bypass (platform_admin) or use workspace plan (user).
 * platform_admin is granted full Enterprise abilities (see getWorkspacePlanAndEntitlementsForUser in entitlements/workspace.ts).
 */
export type PlatformPlan = "platform_admin" | "user";

export type Entitlements = {
  plan: Plan;
  analyze_calls_per_day: number;
  deal_scans_per_day: number;
  lifetime_full_scan_limit: number | null; // null = no cap (Pro/platform_admin)
  digest_manual_send: boolean;
  digest_scheduled: boolean;
  email_digest_max_signals: number;
  ic_narrative_enabled: boolean;
  scan_export_enabled: boolean;
  workspace_invites_enabled: boolean;
  benchmark_enabled: boolean;
  explainability_enabled: boolean;
  backtest_enabled: boolean;
  workspace_enabled: boolean;
};

/** FREE: 3 lifetime scans, no benchmark/explainability/backtest/workspace. */
const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  analyze_calls_per_day: 10,
  deal_scans_per_day: 0,
  lifetime_full_scan_limit: 3,
  digest_manual_send: true,
  digest_scheduled: false,
  email_digest_max_signals: 6,
  ic_narrative_enabled: false,
  scan_export_enabled: false,
  workspace_invites_enabled: false,
  benchmark_enabled: false,
  explainability_enabled: false,
  backtest_enabled: false,
  workspace_enabled: false,
};

/** PRO: unlimited scans, benchmark, explainability, backtest, workspace. Enterprise (cross-org, API, audit) not built yet. */
const PRO_ENTITLEMENTS: Entitlements = {
  plan: "pro",
  analyze_calls_per_day: 200,
  deal_scans_per_day: 50,
  lifetime_full_scan_limit: null,
  digest_manual_send: true,
  digest_scheduled: true,
  email_digest_max_signals: 12,
  ic_narrative_enabled: true,
  scan_export_enabled: true,
  workspace_invites_enabled: true,
  benchmark_enabled: true,
  explainability_enabled: true,
  backtest_enabled: true,
  workspace_enabled: true,
};

/** Enterprise-level limits for platform_admin. They also receive full ENTERPRISE workspace entitlements via getWorkspacePlanAndEntitlementsForUser. */
const PLATFORM_ADMIN_ENTITLEMENTS: Entitlements = {
  plan: "platform_admin",
  analyze_calls_per_day: 1000,
  deal_scans_per_day: 500,
  lifetime_full_scan_limit: null,
  digest_manual_send: true,
  digest_scheduled: true,
  email_digest_max_signals: 24,
  ic_narrative_enabled: true,
  scan_export_enabled: true,
  workspace_invites_enabled: true,
  benchmark_enabled: true,
  explainability_enabled: true,
  backtest_enabled: true,
  workspace_enabled: true,
};

/** Server-only: get effective platform plan for user (from profiles.role). Only platform_admin bypasses; else use workspace plan. */
export async function getPlanForUser(supabase: SupabaseClient, userId: string): Promise<PlatformPlan> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data?.role as string) || "user";
  if (role === "platform_admin") return "platform_admin";
  return "user";
}

/** Get entitlements for a plan. platform_admin gets full Enterprise-level limits. */
export function getEntitlements(plan: Plan): Entitlements {
  if (plan === "platform_admin") return { ...PLATFORM_ADMIN_ENTITLEMENTS };
  if (plan === "pro") return { ...PRO_ENTITLEMENTS };
  return { ...FREE_ENTITLEMENTS };
}

/** Server-only: get plan then entitlements for a user. User gets free-level unless platform_admin (bypass). */
export async function getEntitlementsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlements> {
  const platformPlan = await getPlanForUser(supabase, userId);
  if (platformPlan === "platform_admin") return getEntitlements("platform_admin");
  return getEntitlements("free");
}
