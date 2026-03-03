import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const { searchParams } = new URL(request.url);
  const baseId = searchParams.get("base");
  const conservativeId = searchParams.get("conservative");

  if (!baseId || !conservativeId) {
    return NextResponse.json(
      { error: "base and conservative query params required" },
      { status: 400 }
    );
  }

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
      { code: "PRO_REQUIRED_FOR_SCENARIO" },
      { status: 403 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("id, organization_id")
    .eq("id", dealId)
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

  const { data: scans } = await service
    .from("deal_scans")
    .select("id, risk_index_score, risk_index_band, deal_id")
    .in("id", [baseId, conservativeId])
    .eq("deal_id", dealId)
    .eq("status", "completed");

  if (!scans || scans.length !== 2) {
    return NextResponse.json({ error: "Scans not found or not same deal" }, { status: 404 });
  }

  const baseScan = scans.find((s) => s.id === baseId) as {
    id: string;
    risk_index_score: number | null;
    risk_index_band: string | null;
  };
  const conservativeScan = scans.find((s) => s.id === conservativeId) as {
    id: string;
    risk_index_score: number | null;
    risk_index_band: string | null;
  };

  const { data: baseRisks } = await service
    .from("deal_risks")
    .select("risk_type")
    .eq("deal_scan_id", baseId);
  const { data: conservativeRisks } = await service
    .from("deal_risks")
    .select("risk_type")
    .eq("deal_scan_id", conservativeId);

  const baseSet = new Set((baseRisks ?? []).map((r: { risk_type: string }) => r.risk_type));
  const conservativeSet = new Set((conservativeRisks ?? []).map((r: { risk_type: string }) => r.risk_type));

  const risksAdded = [...conservativeSet].filter((t) => !baseSet.has(t));
  const risksRemoved = [...baseSet].filter((t) => !conservativeSet.has(t));

  const baseScore = baseScan.risk_index_score ?? 0;
  const conservativeScore = conservativeScan.risk_index_score ?? 0;
  const riskScoreDelta = conservativeScore - baseScore;

  return NextResponse.json({
    risk_score_delta: riskScoreDelta,
    base_band: baseScan.risk_index_band,
    conservative_band: conservativeScan.risk_index_band,
    band_change:
      baseScan.risk_index_band !== conservativeScan.risk_index_band
        ? `${baseScan.risk_index_band ?? "—"} → ${conservativeScan.risk_index_band ?? "—"}`
        : null,
    risks_added: risksAdded.length,
    risks_removed: risksRemoved.length,
    risks_added_list: risksAdded,
    risks_removed_list: risksRemoved,
  });
}
