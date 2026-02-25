import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const plan = await getPlanForUser(service, user.id);

  if (plan === "free") {
    return NextResponse.json(
      { code: "PRO_REQUIRED_FOR_PERCENTILE" },
      { status: 403 }
    );
  }

  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, deal_id, asset_type, risk_index_score, status")
    .eq("id", scanId)
    .single();

  if (scanError || !scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const s = scan as {
    deal_id: string;
    asset_type: string | null;
    risk_index_score: number | null;
    status: string;
  };

  if (s.status !== "completed" || s.risk_index_score == null) {
    return NextResponse.json(
      { error: "Scan has no risk score" },
      { status: 400 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("organization_id")
    .eq("id", s.deal_id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const orgId = (deal as { organization_id: string }).organization_id;
  const { data: members } = await service
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", user.id);

  if (!members?.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assetType = s.asset_type ?? "";

  const { data: cohort } = await service
    .from("deal_scans")
    .select("id, risk_index_score")
    .eq("status", "completed")
    .not("risk_index_score", "is", null)
    .eq("asset_type", assetType);

  const cohortList = (cohort ?? []) as { id: string; risk_index_score: number }[];
  const sample_size = cohortList.length;
  const score = s.risk_index_score;
  const countAtOrBelow = cohortList.filter((r) => r.risk_index_score <= score).length;
  const percentile =
    sample_size > 0 ? Math.round((countAtOrBelow / sample_size) * 100) : null;

  return NextResponse.json({
    percentile,
    sample_size,
    asset_type: assetType || null,
  });
}
