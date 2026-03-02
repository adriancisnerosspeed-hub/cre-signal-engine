/**
 * One-click ZIP export: underwriting support bundle (Pro-only).
 * Contains: latest scan JSON, deal export PDF, methodology PDF, risk audit log, backtest summary (if exists).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getExportPdfPayload } from "@/lib/export/getExportPdfPayload";
import { buildExportPdf } from "@/lib/export/exportPdf";
import { RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { buildMethodologyPdf } from "@/lib/methodology/buildMethodologyPdf";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import JSZip from "jszip";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "Deal id required" }, { status: 400 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const entitlements = await getEntitlementsForUser(supabase, user.id);
  if (!entitlements.scan_export_enabled) {
    return NextResponse.json(
      { code: "PRO_REQUIRED_FOR_EXPORT" },
      { status: 403 }
    );
  }

  const service = createServiceRoleClient();

  const { data: deal, error: dealError } = await service
    .from("deals")
    .select("id, name, latest_scan_id, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const latestScanId = (deal as { latest_scan_id?: string | null }).latest_scan_id;
  if (!latestScanId) {
    return NextResponse.json(
      { error: "No scan for this deal; run a scan first." },
      { status: 400 }
    );
  }

  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeName = ((deal as { name?: string }).name ?? "Deal").replace(/\s+/g, "-").slice(0, 40);

  const { data: scanRow } = await service
    .from("deal_scans")
    .select("id, risk_index_score, risk_index_band, risk_index_breakdown, risk_index_version, extraction, completed_at")
    .eq("id", latestScanId)
    .eq("status", "completed")
    .single();

  if (scanRow) {
    const scanJson = {
      scan_id: (scanRow as { id: string }).id,
      risk_index_score: (scanRow as { risk_index_score?: number | null }).risk_index_score,
      risk_index_band: (scanRow as { risk_index_band?: string | null }).risk_index_band,
      risk_index_version: (scanRow as { risk_index_version?: string | null }).risk_index_version,
      breakdown: (scanRow as { risk_index_breakdown?: unknown }).risk_index_breakdown,
      assumptions:
        (scanRow as { extraction?: { assumptions?: unknown } }).extraction?.assumptions ?? {},
      completed_at: (scanRow as { completed_at?: string | null }).completed_at,
    };
    zip.file("latest_scan.json", JSON.stringify(scanJson, null, 2));
  }

  const payload = await getExportPdfPayload(service, latestScanId);
  if (payload) {
    try {
      const pdfBytes = await buildExportPdf(payload);
      zip.file("deal-export.pdf", pdfBytes);
    } catch (err) {
      console.warn("[export-support-bundle] deal PDF failed", err);
    }
  }

  try {
    const methodologyPdf = await buildMethodologyPdf({
      version: RISK_INDEX_VERSION,
      generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    zip.file("methodology.pdf", methodologyPdf);
  } catch (err) {
    console.warn("[export-support-bundle] methodology PDF failed", err);
  }

  const { data: auditRows } = await service
    .from("risk_audit_log")
    .select("deal_id, scan_id, previous_score, new_score, delta, band_change, model_version, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  zip.file("risk_audit_log.json", JSON.stringify(auditRows ?? [], null, 2));

  try {
    if (entitlements.backtest_enabled) {
      const summary = await getPortfolioSummary(service, orgId);
      if (summary.backtest_summary) {
        zip.file("backtest_summary.json", JSON.stringify(summary.backtest_summary, null, 2));
      }
    }
  } catch {
    // omit backtest if unavailable
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const filename = `cre-signal-support-bundle-${safeName}-${timestamp}.zip`;

  return new NextResponse(zipBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
