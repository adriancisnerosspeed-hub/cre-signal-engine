/**
 * Workspace (organization) entitlements — single source of truth for plan-based capabilities.
 * All enforcement reads from organizations.plan + this module only. No profiles.role or user Stripe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspacePlan = "FREE" | "PRO" | "ENTERPRISE";

export interface WorkspaceEntitlements {
  maxLifetimeScans: number | null;
  maxPortfolios: number | null;
  canUseBenchmark: boolean;
  canBuildSnapshot: boolean;
  canCreateCohort: boolean;
  canUsePolicy: boolean;
  canUseSupportBundle: boolean;
  canInviteMembers: boolean;
  /** PRO limit: 1 active policy per org (maxActivePoliciesPerOrg). Enforcement counts enabled policies per organization. */
  maxActivePoliciesPerOrg: number | null;
}

export function getWorkspaceEntitlements(plan: WorkspacePlan): WorkspaceEntitlements {
  switch (plan) {
    case "FREE":
      return {
        maxLifetimeScans: 3,
        maxPortfolios: 1,
        canUseBenchmark: false,
        canBuildSnapshot: false,
        canCreateCohort: false,
        canUsePolicy: false,
        canUseSupportBundle: false,
        canInviteMembers: false,
        maxActivePoliciesPerOrg: 0,
      };
    case "PRO":
      return {
        maxLifetimeScans: null,
        maxPortfolios: 3,
        canUseBenchmark: true,
        canBuildSnapshot: false,
        canCreateCohort: false,
        canUsePolicy: true,
        canUseSupportBundle: true,
        canInviteMembers: false,
        maxActivePoliciesPerOrg: 1,
      };
    case "ENTERPRISE":
      return {
        maxLifetimeScans: null,
        maxPortfolios: null,
        canUseBenchmark: true,
        canBuildSnapshot: true,
        canCreateCohort: true,
        canUsePolicy: true,
        canUseSupportBundle: true,
        canInviteMembers: true,
        maxActivePoliciesPerOrg: null,
      };
  }
}

/**
 * Server-only. Load org plan and return entitlements. Use service role client so plan is always readable.
 * Defaults plan to 'FREE' if column missing or null (e.g. pre-migration).
 */
export async function getWorkspacePlanAndEntitlements(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ plan: WorkspacePlan; entitlements: WorkspaceEntitlements }> {
  const { data: row } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();

  const raw = (row as { plan?: string | null } | null)?.plan;
  const plan: WorkspacePlan =
    raw === "PRO" || raw === "ENTERPRISE" ? raw : "FREE";
  const entitlements = getWorkspaceEntitlements(plan);
  return { plan, entitlements };
}
