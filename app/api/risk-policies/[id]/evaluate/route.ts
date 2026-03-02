import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { evaluateRiskPolicy } from "@/lib/policy/engine";
import type { RiskPolicyRow } from "@/lib/policy/types";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id: policyId } = await params;
  if (!policyId) {
    return NextResponse.json({ error: "Policy id required" }, { status: 400 });
  }

  const { data: policy, error: policyError } = await supabase
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("id", policyId)
    .eq("organization_id", orgId)
    .single();

  if (policyError || !policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const portfolio = await getPortfolioSummary(service, orgId);
  const nowIso = new Date().toISOString();
  const result = evaluateRiskPolicy({
    policy: policy as RiskPolicyRow,
    portfolio,
    nowIso,
  });

  const contextJson = {
    evaluated_at: nowIso,
    portfolio_counts: portfolio.counts,
    portfolio_total: portfolio.deals.length,
  };
  const resultsJson = {
    policy_id: result.policy_id,
    policy_name: result.policy_name,
    evaluated_at: result.evaluated_at,
    overall_status: result.overall_status,
    violation_count: result.violation_count,
    violations: result.violations,
    summary: result.summary,
    recommended_actions: result.recommended_actions,
  };

  const { error: insertError } = await supabase.from("risk_policy_evaluations").insert({
    organization_id: orgId,
    policy_id: policyId,
    evaluated_at: nowIso,
    evaluated_by: user.id,
    context_json: contextJson,
    results_json: resultsJson,
  });

  if (insertError) {
    console.error("[risk-policies evaluate] snapshot insert error", insertError);
    return NextResponse.json({ error: "Evaluation completed but failed to save snapshot" }, { status: 500 });
  }

  return NextResponse.json(result);
}
