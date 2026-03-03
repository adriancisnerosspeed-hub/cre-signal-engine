import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { NextResponse } from "next/server";

export type RiskTrajectoryPoint = {
  completed_at: string;
  score: number;
  percentile: number | null;
  risk_band: string | null;
  snapshot_id: string | null;
};

/**
 * GET /api/deals/[id]/risk-trajectory
 * Returns risk_score_history points for the deal (score and optional percentile over time).
 * PRO+ and ENTERPRISE only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "Deal id required", code: "MISSING_ID" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUseTrajectory) {
    return NextResponse.json(
      {
        error: "Risk trajectory is available on PRO+ and ENTERPRISE only.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO+",
      },
      { status: 403 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("id, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!deal) {
    return NextResponse.json({ error: "Deal not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: rows } = await service
    .from("risk_score_history")
    .select("completed_at, score, percentile, risk_band, snapshot_id")
    .eq("deal_id", dealId)
    .order("completed_at", { ascending: true });

  const points: RiskTrajectoryPoint[] = (rows ?? []).map((r: { completed_at: string; score: number; percentile?: number | null; risk_band?: string | null; snapshot_id?: string | null }) => ({
    completed_at: r.completed_at,
    score: r.score,
    percentile: r.percentile ?? null,
    risk_band: r.risk_band ?? null,
    snapshot_id: r.snapshot_id ?? null,
  }));

  return NextResponse.json({ points });
}
