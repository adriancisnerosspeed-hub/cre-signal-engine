import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { buildExportPdf } from "@/lib/export/exportPdf";
import {
  selectTopAssumptions,
  selectTopRisks,
  selectMacroSignalsForPdf,
} from "@/lib/export/pdfSelectors";
import type { DealScanAssumptions } from "@/lib/dealScanContract";
import { getRecommendedActions } from "@/lib/icRecommendedActions";
import { NextResponse } from "next/server";

const DEBUG_PDF_EXPORT = process.env.DEBUG_PDF_EXPORT === "true";

export const runtime = "nodejs";

function json500(error: string, detail?: string) {
  return NextResponse.json(
    { error, ...(detail ? { detail } : {}) },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  try {
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
    .select("id, deal_id, risk_index_score, risk_index_band, risk_index_breakdown, risk_index_version, prompt_version, model, extraction, completed_at, created_at")
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

  const riskById = new Map(riskList.map((r) => [r.id, r]));
  const linksWithRisk = links.map((l) => {
    const sig = signalsMap[String(l.signal_id)];
    const risk = riskById.get(l.deal_risk_id);
    return {
      deal_risk_id: l.deal_risk_id,
      risk_type: risk?.risk_type ?? "",
      signal_id: String(l.signal_id),
      link_reason: l.link_reason,
      signal_type: sig?.signal_type ?? null,
      what_changed: sig?.what_changed ?? null,
    };
  });
  const assetType = (deal as { asset_type?: string | null }).asset_type ?? null;
  const market = (deal as { market?: string | null }).market ?? null;
  const macroSignals = selectMacroSignalsForPdf({
    linksWithRisk,
    assetType,
    market,
  });

  const extraction = (scan as { extraction?: unknown }).extraction;
  const assumptions =
    extraction != null && typeof extraction === "object" && extraction !== null && "assumptions" in extraction
      ? (extraction as { assumptions?: DealScanAssumptions }).assumptions
      : undefined;
  const topAssumptions = selectTopAssumptions(assumptions, 9);
  const riskRows = riskList.map((r) => ({
    risk_type: r.risk_type,
    severity_current: r.severity_current,
    confidence: r.confidence,
    why_it_matters: r.why_it_matters,
    recommended_action: r.recommended_action,
  }));
  const topRisks = selectTopRisks(riskRows, 3);

  const risksWithSignals = riskList.map((r) => ({
    severity_current: r.severity_current,
    risk_type: r.risk_type,
    signal_types: (linksWithRisk.filter((l) => l.deal_risk_id === r.id).map((l) => l.signal_type ?? "")).filter(Boolean),
  }));
  const recommendedActions = getRecommendedActions(risksWithSignals);
  const recommendedBullets = recommendedActions.length > 0 ? recommendedActions.slice(0, 4) : [];

  let icMemoHighlights: string | null = null;
  const { data: narrativeRow } = await service
    .from("deal_scan_narratives")
    .select("content")
    .eq("deal_scan_id", scanId)
    .maybeSingle();
  const narrativeContent = (narrativeRow as { content?: unknown } | undefined)?.content;
  if (narrativeContent != null && typeof narrativeContent === "string") {
    const trimmed = narrativeContent.trim();
    icMemoHighlights = trimmed.length > 1200 ? trimmed.slice(0, 1197) + "…" : trimmed;
  }

  const hasDealContext = !!(assetType ?? market);
  const macroSectionLabel = hasDealContext ? "Market Signals" : "General Macro Signals";

  const completedAt = (scan as { completed_at?: string | null }).completed_at;
  const createdAt = (scan as { created_at?: string }).created_at;
  const scanTimestamp =
    (typeof completedAt === "string" && completedAt) ||
    (typeof createdAt === "string" && createdAt) ||
    new Date().toISOString();
  const scanTimestampStr =
    typeof scanTimestamp === "string"
      ? (() => {
          try {
            return new Date(scanTimestamp).toISOString().slice(0, 19).replace("T", " ");
          } catch {
            return new Date().toISOString().slice(0, 19).replace("T", " ");
          }
        })()
      : new Date().toISOString().slice(0, 19).replace("T", " ");

  const STALE_DAYS = 30;
  const completedAtIso = (scan as { completed_at?: string | null }).completed_at;
  const completedAtMs = completedAtIso ? new Date(completedAtIso).getTime() : 0;
  const staleScan = completedAtMs > 0 && Date.now() - completedAtMs > STALE_DAYS * 24 * 60 * 60 * 1000;
  const rawBreakdown = (scan as { risk_index_breakdown?: Record<string, unknown> | null }).risk_index_breakdown ?? null;
  const riskBreakdown = rawBreakdown
    ? { ...rawBreakdown, stale_scan: staleScan }
    : null;

  const dealName =
    (deal as { name?: unknown }).name != null && typeof (deal as { name: string }).name === "string"
      ? (deal as { name: string }).name
      : "Deal";

  const payload = {
    dealName,
    assetType,
    market,
    riskIndexScore: (scan as { risk_index_score?: number | null }).risk_index_score ?? null,
    riskIndexBand: (scan as { risk_index_band?: string | null }).risk_index_band ?? null,
    riskIndexVersion: (scan as { risk_index_version?: string | null }).risk_index_version ?? null,
    riskBreakdown,
    promptVersion: (scan as { prompt_version?: string | null }).prompt_version ?? null,
    scanTimestamp: scanTimestampStr,
    scanId,
    model: (scan as { model?: string | null }).model ?? null,
    assumptions: topAssumptions,
    risks: topRisks,
    macroSignals,
    macroSectionLabel,
    recommendedActions: recommendedBullets,
    icMemoHighlights,
  };
  if (DEBUG_PDF_EXPORT) {
    console.info("[DEBUG_PDF_EXPORT] payload", JSON.stringify(payload, null, 2));
  }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildExportPdf(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[export_pdf] render_failed", { scan_id: scanId, deal_id: (deal as { id: string }).id, error: message });
      return json500("PDF generation failed", message);
    }

    console.info("[export_pdf] success", {
      scan_id: scanId,
      deal_id: (deal as { id: string }).id,
      risk_count: topRisks.length,
      macro_signal_count: macroSignals.length,
    });

    const filename = `cre-signal-${dealName.replace(/\s+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export_pdf] unexpected_error", { error: message, stack: err instanceof Error ? err.stack : undefined });
    return json500("Export failed", message);
  }
}
