import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { buildExportPdf } from "@/lib/export/exportPdf";
import {
  selectTopAssumptions,
  selectTopRisks,
  dedupeSignals,
} from "@/lib/export/pdfSelectors";
import type { DealScanAssumptions } from "@/lib/dealScanContract";
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
    .select("id, deal_id, risk_index_score, risk_index_band, prompt_version, model, extraction, completed_at, created_at")
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
    .select("id, risk_type, severity_current, confidence, why_it_matters, recommended_action")
    .eq("deal_scan_id", scanId);

  const riskList = (risks ?? []) as {
    id: string;
    risk_type: string;
    severity_current: string;
    confidence: string | null;
    why_it_matters: string | null;
    recommended_action: string | null;
  }[];

  const riskIds = riskList.map((r) => r.id);
  const { data: linkRows } = await service
    .from("deal_signal_links")
    .select("deal_risk_id, signal_id, link_reason")
    .in("deal_risk_id", riskIds);

  const links = (linkRows ?? []) as { deal_risk_id: string; signal_id: string; link_reason: string | null }[];
  const signalIds = [...new Set(links.map((l) => l.signal_id))];
  let signalsMap: Record<string, { signal_type: string | null; what_changed: string | null }> = {};
  if (signalIds.length > 0) {
    const { data: signalRows } = await service
      .from("signals")
      .select("id, signal_type, what_changed")
      .in("id", signalIds);
    for (const s of (signalRows ?? []) as { id: string; signal_type: string | null; what_changed: string | null }[]) {
      signalsMap[String(s.id)] = { signal_type: s.signal_type, what_changed: s.what_changed };
    }
  }

  const linksWithSignal = links.map((l) => {
    const sig = signalsMap[String(l.signal_id)];
    return {
      signal_id: String(l.signal_id),
      link_reason: l.link_reason,
      signal_type: sig?.signal_type ?? null,
      what_changed: sig?.what_changed ?? null,
    };
  });
  const macroSignals = dedupeSignals(
    linksWithSignal.map((l) => ({
      signal_id: l.signal_id,
      link_reason: l.link_reason,
      signal_type: l.signal_type ?? null,
      what_changed: l.what_changed ?? null,
    })),
    5
  );

  const extraction = (scan as { extraction?: unknown }).extraction;
  const assumptions =
    extraction != null && typeof extraction === "object" && extraction !== null && "assumptions" in extraction
      ? (extraction as { assumptions?: DealScanAssumptions }).assumptions
      : undefined;
  const topAssumptions = selectTopAssumptions(assumptions, 6);
  const riskRows = riskList.map((r) => ({
    risk_type: r.risk_type,
    severity_current: r.severity_current,
    confidence: r.confidence,
    why_it_matters: r.why_it_matters,
    recommended_action: r.recommended_action,
  }));
  const topRisks = selectTopRisks(riskRows, 3);

  const hasDealContext =
    !!((deal as { asset_type?: string | null }).asset_type ?? (deal as { market?: string | null }).market);
  const macroSectionLabel = hasDealContext ? "Market Signals" : "General Macro Signals";

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
    scanId,
    model: (scan as { model?: string | null }).model ?? null,
    assumptions: topAssumptions,
    risks: topRisks,
    macroSignals,
    macroSectionLabel,
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
