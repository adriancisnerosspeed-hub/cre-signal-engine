import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { evaluateAllPolicies } from "@/lib/policy/engine";
import type { RiskPolicyRow } from "@/lib/policy/types";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { NextResponse } from "next/server";

/**
 * POST /api/risk-policies/evaluate-all
 * Evaluate all active policies for the org's portfolio. PRO+ (max 3) or ENTERPRISE only.
 * Returns policy_status_summary and per-policy breakdown.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected", code: "NO_WORKSPACE" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUsePolicy) {
    return NextResponse.json(
      {
        error: "Policy evaluation is not available on this plan.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }
  if (entitlements.maxActivePoliciesPerOrg === 0) {
    return NextResponse.json(
      {
        error: "No policies on FREE plan.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }

  const { data: policies } = await service
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false });

  const activePolicies = (policies ?? []) as RiskPolicyRow[];
  if (activePolicies.length === 0) {
    return NextResponse.json({
      policy_status_summary: { overall: "pass" as const, policyCount: 0, violationCount: 0 },
      results: [],
      breakdown: [],
    });
  }

  if (
    entitlements.maxActivePoliciesPerOrg != null &&
    activePolicies.length > entitlements.maxActivePoliciesPerOrg
  ) {
    return NextResponse.json(
      {
        error: `Evaluate-all supports up to ${entitlements.maxActivePoliciesPerOrg} active policies on this plan.`,
        code: ENTITLEMENT_ERROR_CODES.POLICY_LIMIT_REACHED,
      },
      { status: 403 }
    );
  }

  const portfolio = await getPortfolioSummary(service, orgId);
  const nowIso = new Date().toISOString();
  const out = evaluateAllPolicies({ policies: activePolicies, portfolio, nowIso });

  return NextResponse.json(out);
}
