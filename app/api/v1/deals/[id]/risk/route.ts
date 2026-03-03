import { createServiceRoleClient } from "@/lib/supabase/service";
import { getOrgFromToken } from "@/lib/apiAuth";
import { logApiV1Call } from "@/lib/eventLog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/v1/deals/:id/risk
 * Returns risk summary for the deal: latest score, band, percentile (if available), scan_id, completed_at.
 * Token-based auth only; org must match token's org. 404 if deal not found or not in org.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getOrgFromToken(request);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing API token", code: "UNAUTHORIZED" }, { status: 401 });
  }
  logApiV1Call({ org_id: ctx.organizationId, endpoint: "GET /api/v1/deals/:id/risk", token_id: ctx.tokenId });

  const { id: dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "Deal id required", code: "MISSING_ID" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  const { data: deal, error } = await service
    .from("deals")
    .select("id, organization_id, latest_scan_id, latest_risk_score, latest_risk_band, latest_scanned_at")
    .eq("id", dealId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error || !deal) {
    return NextResponse.json({ error: "Deal not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const d = deal as {
    latest_scan_id: string | null;
    latest_risk_score: number | null;
    latest_risk_band: string | null;
    latest_scanned_at: string | null;
  };

  return NextResponse.json({
    deal_id: dealId,
    score: d.latest_risk_score ?? null,
    risk_band: d.latest_risk_band ?? null,
    scan_id: d.latest_scan_id ?? null,
    completed_at: d.latest_scanned_at ?? null,
    percentile: null, // optional; not in initial v1 scope per execution plan
  });
}
