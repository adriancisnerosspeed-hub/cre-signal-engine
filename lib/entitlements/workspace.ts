/**
 * Workspace (organization) entitlements — single source of truth for plan-based capabilities.
 * All enforcement reads from organizations.plan + this module only. No workspace role here; platform role (profiles.role) only for bypass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanForUser } from "@/lib/entitlements";

export type WorkspacePlan = "FREE" | "PRO" | "PRO+" | "ENTERPRISE";

export interface WorkspaceEntitlements {
  maxLifetimeScans: number | null;
  maxPortfolios: number | null;
  canUseBenchmark: boolean;
  canBuildSnapshot: boolean;
  canCreateCohort: boolean;
  canUsePolicy: boolean;
  canUseSupportBundle: boolean;
  canInviteMembers: boolean;
  /** PRO limit: 1 active policy per org (maxActivePoliciesPerOrg). PRO+: 3. Enterprise: unlimited. */
  maxActivePoliciesPerOrg: number | null;
  /** Max members (including creator). FREE: 1. PRO: 5. PRO+: 10. ENTERPRISE: null (unlimited). */
  maxMembers: number | null;
  /** Score-over-time trajectory and advanced governance (PRO+ and ENTERPRISE). */
  canUseTrajectory: boolean;
  /** Governance export packet (PRO+ and ENTERPRISE). */
  canUseGovernanceExport: boolean;
  /** Snapshot version lock on portfolio view (PRO+ and ENTERPRISE). */
  canLockMethodVersion: boolean;
  /** Supplemental AI Insights tab on deal scans (PRO+ and ENTERPRISE; feature-flag gated). */
  canUseAiInsights: boolean;
  /** Monthly scan cap. FREE: null (lifetime cap instead). PRO: 10. PRO+: null (unlimited). ENTERPRISE: null (unlimited). */
  maxScansPerMonth: number | null;
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
        maxMembers: 1,
        canUseTrajectory: false,
        canUseGovernanceExport: false,
        canLockMethodVersion: false,
        canUseAiInsights: false,
        maxScansPerMonth: null,
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
        canInviteMembers: true,
        maxActivePoliciesPerOrg: 1,
        maxMembers: 5,
        canUseTrajectory: false,
        canUseGovernanceExport: false,
        canLockMethodVersion: false,
        canUseAiInsights: false,
        maxScansPerMonth: 10,
      };
    case "PRO+":
      return {
        maxLifetimeScans: null,
        maxPortfolios: 3,
        canUseBenchmark: true,
        canBuildSnapshot: false,
        canCreateCohort: false,
        canUsePolicy: true,
        canUseSupportBundle: true,
        canInviteMembers: true,
        maxActivePoliciesPerOrg: 3,
        maxMembers: 10,
        canUseTrajectory: true,
        canUseGovernanceExport: true,
        canLockMethodVersion: true,
        canUseAiInsights: true,
        maxScansPerMonth: null,
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
        maxMembers: null,
        canUseTrajectory: true,
        canUseGovernanceExport: true,
        canLockMethodVersion: true,
        canUseAiInsights: true,
        maxScansPerMonth: null,
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
    raw === "PRO" || raw === "PRO+" || raw === "ENTERPRISE" ? raw : "FREE";
  const entitlements = getWorkspaceEntitlements(plan);
  return { plan, entitlements };
}

/**
 * Server-only. Resolves effective workspace plan and entitlements for a user.
 * Always use this (not getWorkspacePlanAndEntitlements) when gating features for the current user.
 *
 * Platform admin has full Enterprise abilities: if profiles.role = 'platform_admin', the user
 * receives plan ENTERPRISE and full Enterprise workspace entitlements (API tokens, custom cohorts,
 * snapshot build, unlimited policies, trajectory, governance export, support bundle, etc.) in any
 * org, regardless of the organization's plan. Use this for all workspace-gated features so
 * platform_admin is treated as Enterprise.
 */
export async function getWorkspacePlanAndEntitlementsForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<{ plan: WorkspacePlan; entitlements: WorkspaceEntitlements; ownerBypass: boolean }> {
  const userPlan = await getPlanForUser(supabase, userId);
  if (userPlan === "platform_admin") {
    return {
      plan: "ENTERPRISE",
      entitlements: getWorkspaceEntitlements("ENTERPRISE"),
      ownerBypass: true,
    };
  }
  const { plan, entitlements } = await getWorkspacePlanAndEntitlements(supabase, orgId);
  return { plan, entitlements, ownerBypass: false };
}
