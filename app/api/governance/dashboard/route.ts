import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/governance/dashboard
 * Minimal governance dashboard: portfolio risk trend (avg score over time), policy violation count, override count.
 * Enterprise or PRO+ (read-only). Scoped by current org and optional date range.
 */
export async function GET(request: Request) {
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
  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const canView =
    plan === "ENTERPRISE" || entitlements.canUseTrajectory || entitlements.canUseGovernanceExport;
  if (!canView) {
    return NextResponse.json(
      {
        error: "Governance dashboard is available on PRO+ and Enterprise plans.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO+",
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(
    Math.max(1, Number.parseInt(searchParams.get("days") ?? "30", 10) || 30),
    90
  );
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const portfolio = await getPortfolioSummary(service, orgId);
  const dealIds = portfolio.deals.map((d) => d.id);

  let riskTrend: { date: string; avg_score: number; point_count: number }[] = [];
  let overrideCount = 0;

  if (dealIds.length > 0) {
    const { data: historyRows } = await service
      .from("risk_score_history")
      .select("deal_id, score, completed_at")
      .in("deal_id", dealIds)
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: true });

    const byDate: Record<string, { sum: number; count: number }> = {};
    for (const row of historyRows ?? []) {
      const r = row as { completed_at: string; score: number };
      const date = r.completed_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = { sum: 0, count: 0 };
      byDate[date].sum += r.score;
      byDate[date].count += 1;
    }
    riskTrend = Object.entries(byDate)
      .map(([date, { sum, count }]) => ({
        date,
        avg_score: Math.round((sum / count) * 10) / 10,
        point_count: count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const { count } = await service
      .from("policy_overrides")
      .select("id", { count: "exact", head: true })
      .in("deal_id", dealIds);
    overrideCount = count ?? 0;
  }

  const violationCount = portfolio.policy_status?.violation_count ?? 0;
  const policyOverall = portfolio.policy_status?.overall_status ?? null;

  return NextResponse.json({
    risk_trend: riskTrend,
    policy_violation_count: violationCount,
    policy_overall_status: policyOverall,
    override_count: overrideCount,
    total_deals: portfolio.deals.length,
    scanned_count: portfolio.counts.scanned,
    days,
  });
}
