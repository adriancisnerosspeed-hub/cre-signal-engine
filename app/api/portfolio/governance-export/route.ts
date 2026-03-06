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
 * GET /api/portfolio/governance-export
 * Returns a governance export packet: risk index, percentile, snapshot metadata, policy results, overrides, audit trail.
 * PRO+ and ENTERPRISE only. Basic payload: score, percentile, snapshot metadata, policy results.
 */
export async function GET() {
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
  if (!entitlements.canUseGovernanceExport) {
    return NextResponse.json(
      {
        error: "Governance export is available on Analyst, Fund, and Enterprise plans only.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO+",
      },
      { status: 403 }
    );
  }

  const summary = await getPortfolioSummary(service, orgId, { benchmarkEnabled: true });
  const exportedAt = new Date().toISOString();

  const riskIndex = summary.deals
    .filter((d) => d.latest_risk_score != null)
    .map((d) => ({
      deal_id: d.id,
      deal_name: d.name,
      score: d.latest_risk_score,
      band: d.latest_risk_band,
      latest_scanned_at: d.latest_scanned_at,
    }));

  const snapshotMetadata = summary.benchmark_context
    ? {
        cohort_type: summary.benchmark_context.cohort_type,
        method_version: summary.benchmark_context.method_version ?? null,
        percentile_rank: summary.benchmark_context.percentile_rank,
        snapshot_id: summary.benchmark_context.snapshot_id ?? null,
        cohort_key: summary.benchmark_context.cohort_key ?? null,
        delta_comparable: summary.benchmark_context.delta_comparable ?? false,
      }
    : null;

  const { data: policies } = await service
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false });
  const activePolicies = (policies ?? []) as RiskPolicyRow[];
  const nowIso = new Date().toISOString();
  const policyResults =
    activePolicies.length > 0
      ? evaluateAllPolicies({ policies: activePolicies, portfolio: summary, nowIso })
      : null;

  const dealIds = summary.deals.map((d) => d.id).filter(Boolean);
  const { data: overrides } =
    dealIds.length > 0
      ? await service
          .from("policy_overrides")
          .select("id, deal_id, policy_id, snapshot_id, reason, user_id, created_at")
          .in("deal_id", dealIds)
      : { data: [] };
  const overrideList = (overrides ?? []).map((o: { id: string; deal_id: string; policy_id: string; snapshot_id: string | null; reason: string | null; user_id: string | null; created_at: string }) => ({
    id: o.id,
    deal_id: o.deal_id,
    policy_id: o.policy_id,
    snapshot_id: o.snapshot_id,
    reason: o.reason,
    user_id: o.user_id,
    created_at: o.created_at,
  }));

  const { data: auditRows } = await service
    .from("governance_decision_log")
    .select("id, deal_id, policy_id, snapshot_id, action_type, note, user_id, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  const auditTrail = (auditRows ?? []).map((r: { id: string; deal_id: string | null; policy_id: string | null; snapshot_id: string | null; action_type: string; note: string | null; user_id: string | null; created_at: string }) => ({
    id: r.id,
    deal_id: r.deal_id,
    policy_id: r.policy_id,
    snapshot_id: r.snapshot_id,
    action_type: r.action_type,
    note: r.note,
    user_id: r.user_id,
    created_at: r.created_at,
  }));

  const payload = {
    exported_at: exportedAt,
    organization_id: orgId,
    risk_index: riskIndex,
    portfolio_counts: summary.counts,
    distribution_by_band: summary.distributionByBand,
    snapshot_metadata: snapshotMetadata,
    benchmark_percentile: summary.benchmark?.percentile_rank ?? null,
    policy_results: policyResults
      ? {
          policy_status_summary: policyResults.policy_status_summary,
          breakdown: policyResults.breakdown,
        }
      : null,
    overrides: overrideList,
    audit_trail: auditTrail,
  };

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="governance-export-${orgId.slice(0, 8)}-${exportedAt.slice(0, 10)}.json"`,
    },
  });
}
