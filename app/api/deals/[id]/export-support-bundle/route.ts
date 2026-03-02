/**
 * One-click ZIP export: underwriting support bundle (Pro-only).
 * Contains: latest scan JSON, deal export PDF, methodology PDF, risk audit log, backtest summary (if exists).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { getExportPdfPayload } from "@/lib/export/getExportPdfPayload";
import { buildExportPdf } from "@/lib/export/exportPdf";
import { RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { buildMethodologyPdf } from "@/lib/methodology/buildMethodologyPdf";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { evaluateRiskPolicy } from "@/lib/policy/engine";
import type { RiskPolicyRow } from "@/lib/policy/types";
import { getOrComputeDealBenchmark } from "@/lib/benchmark/compute";
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

  const snapshotId = new URL(request.url).searchParams.get("snapshot_id");

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUseSupportBundle) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        message: "Support bundle export is not available on this plan.",
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }

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

  const payload = await getExportPdfPayload(service, latestScanId, {
    snapshotId: snapshotId ?? undefined,
  });
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
    if (entitlements.canUseBenchmark) {
      const summary = await getPortfolioSummary(service, orgId);
      if (summary.backtest_summary) {
        zip.file("backtest_summary.json", JSON.stringify(summary.backtest_summary, null, 2));
      }
    }
  } catch {
    // omit backtest if unavailable
  }

  try {
    const { data: policies } = await service
      .from("risk_policies")
      .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
      .eq("organization_id", orgId)
      .eq("is_enabled", true)
      .eq("is_shared", true)
      .order("updated_at", { ascending: false });
    const activePolicy = Array.isArray(policies) && policies.length > 0 ? (policies[0] as RiskPolicyRow) : null;
    if (activePolicy) {
      const summary = await getPortfolioSummary(service, orgId);
      const nowIso = new Date().toISOString();
      const evaluation = evaluateRiskPolicy({ policy: activePolicy, portfolio: summary, nowIso });
      zip.file("risk_policy.json", JSON.stringify({ id: activePolicy.id, name: activePolicy.name, description: activePolicy.description, is_enabled: activePolicy.is_enabled, rules_json: activePolicy.rules_json, updated_at: activePolicy.updated_at }, null, 2));
      zip.file("risk_policy_evaluation.json", JSON.stringify(evaluation, null, 2));
    }
  } catch {
    // omit policy artifacts if unavailable
  }

  if (snapshotId) {
    try {
      // Include snapshot_hash, distributions (with values_sorted), and deal_benchmark so the
      // percentile remains reproducible even if underlying scans or member scan_id are later removed.
      const benchmarkResult = await getOrComputeDealBenchmark(service, {
        dealId,
        snapshotId,
        metricKey: "risk_index_v2",
      });
      if (benchmarkResult) {
        const { data: snapshotRow } = await service
          .from("benchmark_cohort_snapshots")
          .select("cohort_id, as_of_timestamp, snapshot_hash, n_eligible, method_version, build_status")
          .eq("id", snapshotId)
          .single();
        let cohortRow: { id: string; key: string; name: string; rule_json: unknown; rule_hash: string | null } | null = null;
        if (snapshotRow) {
          const res = await service
            .from("benchmark_cohorts")
            .select("id, key, name, rule_json, rule_hash")
            .eq("id", (snapshotRow as { cohort_id: string }).cohort_id)
            .single();
          cohortRow = res.data;
        }
        const { data: distRows } = await service
          .from("benchmark_snapshot_distributions")
          .select("metric_key, n, min_val, max_val, median_val, values_sorted")
          .eq("snapshot_id", snapshotId);

        if (cohortRow) {
          zip.file(
            "benchmark_cohort.json",
            JSON.stringify(
              {
                id: (cohortRow as { id: string }).id,
                key: (cohortRow as { key: string }).key,
                name: (cohortRow as { name: string }).name,
                rule_json: (cohortRow as { rule_json: unknown }).rule_json,
                rule_hash: (cohortRow as { rule_hash: string | null }).rule_hash,
              },
              null,
              2
            )
          );
        }
        if (snapshotRow) {
          zip.file(
            "benchmark_snapshot.json",
            JSON.stringify(
              {
                snapshot_id: snapshotId,
                cohort_id: (snapshotRow as { cohort_id: string }).cohort_id,
                as_of_timestamp: (snapshotRow as { as_of_timestamp: string }).as_of_timestamp,
                snapshot_hash: (snapshotRow as { snapshot_hash: string | null }).snapshot_hash,
                n_eligible: (snapshotRow as { n_eligible: number }).n_eligible,
                method_version: (snapshotRow as { method_version: string }).method_version,
                build_status: (snapshotRow as { build_status: string }).build_status,
              },
              null,
              2
            )
          );
        }
        zip.file(
          "benchmark_distributions.json",
          JSON.stringify(
            (distRows ?? []).map((r: Record<string, unknown>) => ({
              metric_key: r.metric_key,
              n: r.n,
              min: r.min_val,
              max: r.max_val,
              median: r.median_val,
              values_sorted: r.values_sorted,
            })),
            null,
            2
          )
        );
        zip.file("deal_benchmark.json", JSON.stringify(benchmarkResult, null, 2));
      }
    } catch {
      // omit benchmark artifacts if unavailable
    }
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
