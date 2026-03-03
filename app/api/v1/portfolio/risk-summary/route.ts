import { createServiceRoleClient } from "@/lib/supabase/service";
import { getOrgFromToken } from "@/lib/apiAuth";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { logApiV1Call } from "@/lib/eventLog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/v1/portfolio/risk-summary
 * Returns portfolio-level risk summary: total deals, scanned count, distribution by band,
 * optional policy status (pass/warn/block), last updated. Token-based auth only.
 */
export async function GET(request: Request) {
  const ctx = await getOrgFromToken(request);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing API token", code: "UNAUTHORIZED" }, { status: 401 });
  }
  logApiV1Call({ org_id: ctx.organizationId, endpoint: "GET /api/v1/portfolio/risk-summary", token_id: ctx.tokenId });

  const service = createServiceRoleClient();
  const summary = await getPortfolioSummary(service, ctx.organizationId);

  const counts = summary.counts;
  const distributionByBand = summary.distributionByBand || {};
  const policyStatus = summary.policy_status;

  const lastUpdated =
    summary.deals.length > 0
      ? summary.deals
          .map((d) => d.latest_scanned_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null
      : null;

  return NextResponse.json({
    total_deals: counts.total,
    scanned_count: counts.scanned,
    unscanned_count: counts.unscanned,
    distribution_by_band: distributionByBand,
    policy_status: policyStatus
      ? {
          overall_status: policyStatus.overall_status,
          violation_count: policyStatus.violation_count,
        }
      : null,
    last_updated: lastUpdated,
  });
}
