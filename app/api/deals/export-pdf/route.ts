import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { buildExportPdf } from "@/lib/export/exportPdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { scan_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scanId = typeof body.scan_id === "string" ? body.scan_id.trim() : null;
  if (!scanId) {
    return NextResponse.json({ error: "scan_id required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const plan = await getPlanForUser(service, user.id);

  if (plan === "free") {
    return NextResponse.json({ code: "PRO_REQUIRED_FOR_EXPORT" }, { status: 403 });
  }

  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, deal_id, risk_index_score, risk_index_band, prompt_version, completed_at, created_at")
    .eq("id", scanId)
    .eq("status", "completed")
    .single();

  if (scanError || !scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { data: deal, error: dealError } = await service
    .from("deals")
    .select("id, name, asset_type, market, organization_id")
    .eq("id", (scan as { deal_id: string }).deal_id)
    .single();

  if (dealError || !deal) {
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

  const { data: risks } = await service
    .from("deal_risks")
    .select("id, risk_type, severity_current, recommended_action")
    .eq("deal_scan_id", scanId);

  const riskList = (risks ?? []) as {
    id: string;
    risk_type: string;
    severity_current: string;
    recommended_action: string | null;
  }[];

  const riskIds = riskList.map((r) => r.id);
  const { data: links } = await service
    .from("deal_signal_links")
    .select("deal_risk_id, link_reason")
    .in("deal_risk_id", riskIds);

  const linkReasonsByRiskId = new Map<string, string[]>();
  for (const row of links ?? []) {
    const r = row as { deal_risk_id: string; link_reason: string | null };
    const reason = r.link_reason ?? "";
    if (!linkReasonsByRiskId.has(r.deal_risk_id)) linkReasonsByRiskId.set(r.deal_risk_id, []);
    linkReasonsByRiskId.get(r.deal_risk_id)!.push(reason);
  }

  const macroOverlay = riskList.map((r) => ({
    risk_type: r.risk_type,
    link_reasons: linkReasonsByRiskId.get(r.id) ?? [],
  })).filter((m) => m.link_reasons.length > 0);

  const scanTimestamp =
    (scan as { completed_at?: string | null }).completed_at ||
    (scan as { created_at?: string }).created_at ||
    new Date().toISOString();

  const pdfBytes = await buildExportPdf({
    dealName: (deal as { name: string }).name,
    assetType: (deal as { asset_type?: string | null }).asset_type ?? null,
    market: (deal as { market?: string | null }).market ?? null,
    riskIndexScore: (scan as { risk_index_score?: number | null }).risk_index_score ?? null,
    riskIndexBand: (scan as { risk_index_band?: string | null }).risk_index_band ?? null,
    promptVersion: (scan as { prompt_version?: string | null }).prompt_version ?? null,
    scanTimestamp: new Date(scanTimestamp).toISOString().slice(0, 19).replace("T", " "),
    risks: riskList.map((r) => ({
      risk_type: r.risk_type,
      severity_current: r.severity_current,
      recommended_action: r.recommended_action,
    })),
    macroOverlay,
  });

  const filename = `cre-signal-${(deal as { name: string }).name.replace(/\s+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
