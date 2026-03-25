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

export interface TrialInfo {
  isTrialing: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  trialExpired: boolean;
}

const NO_TRIAL: TrialInfo = {
  isTrialing: false,
  trialEndsAt: null,
  trialDaysRemaining: null,
  trialExpired: false,
};

/**
 * Resolve effective plan from org row, applying trial overlay when applicable.
 * Trial only applies when plan is FREE and trial_ends_at / trial_plan are set.
 */
export function resolveEffectivePlan(org: {
  plan?: string | null;
  trial_ends_at?: string | null;
  trial_plan?: string | null;
}): { effectivePlan: WorkspacePlan; trial: TrialInfo } {
  const rawPlan = org.plan;
  const basePlan: WorkspacePlan =
    rawPlan === "PRO" || rawPlan === "PRO+" || rawPlan === "ENTERPRISE" ? rawPlan : "FREE";

  // Trial only applies to FREE orgs
  if (basePlan !== "FREE" || !org.trial_ends_at || !org.trial_plan) {
    // Check if there was a trial that's now irrelevant (paid org with leftover fields)
    return { effectivePlan: basePlan, trial: NO_TRIAL };
  }

  const trialEnd = new Date(org.trial_ends_at);
  const now = Date.now();
  const msRemaining = trialEnd.getTime() - now;
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  const trialPlan: WorkspacePlan =
    org.trial_plan === "PRO" || org.trial_plan === "PRO+" || org.trial_plan === "ENTERPRISE"
      ? org.trial_plan
      : "FREE";

  if (daysRemaining > 0) {
    // Active trial
    return {
      effectivePlan: trialPlan,
      trial: {
        isTrialing: true,
        trialEndsAt: org.trial_ends_at,
        trialDaysRemaining: daysRemaining,
        trialExpired: false,
      },
    };
  }

  // Expired trial
  return {
    effectivePlan: "FREE",
    trial: {
      isTrialing: false,
      trialEndsAt: org.trial_ends_at,
      trialDaysRemaining: daysRemaining,
      trialExpired: true,
    },
  };
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
 * Trial overlay: if org is FREE with active trial, returns trial plan entitlements.
 */
export async function getWorkspacePlanAndEntitlements(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ plan: WorkspacePlan; entitlements: WorkspaceEntitlements; trial: TrialInfo }> {
  const { data: row } = await supabase
    .from("organizations")
    .select("plan, trial_ends_at, trial_plan")
    .eq("id", orgId)
    .maybeSingle();

  const orgRow = row as { plan?: string | null; trial_ends_at?: string | null; trial_plan?: string | null } | null;
  const { effectivePlan, trial } = resolveEffectivePlan(orgRow ?? {});
  const entitlements = getWorkspaceEntitlements(effectivePlan);
  return { plan: effectivePlan, entitlements, trial };
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
): Promise<{ plan: WorkspacePlan; entitlements: WorkspaceEntitlements; ownerBypass: boolean; trial: TrialInfo }> {
  const userPlan = await getPlanForUser(supabase, userId);
  if (userPlan === "platform_admin") {
    return {
      plan: "ENTERPRISE",
      entitlements: getWorkspaceEntitlements("ENTERPRISE"),
      ownerBypass: true,
      trial: NO_TRIAL,
    };
  }
  const { plan, entitlements, trial } = await getWorkspacePlanAndEntitlements(supabase, orgId);
  return { plan, entitlements, ownerBypass: false, trial };
}
