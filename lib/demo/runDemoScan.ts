/**
 * Run a scan for a demo deal, bypassing the usage-check RPC.
 * This mirrors the platform_admin direct-insert path in app/api/deals/scan/route.ts
 * and must never be called for non-demo deals.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import OpenAI from "openai";
import { parseAndNormalizeDealScan } from "@/lib/dealScanContract";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { DEAL_SCAN_SYSTEM_PROMPT, DEAL_SCAN_PROMPT_VERSION } from "@/lib/prompts/dealScanPrompt";

function inputTextHash(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function runDemoScan(
  service: SupabaseClient,
  {
    dealId,
    dealInputId,
    rawText,
    assetType,
    market,
    createdBy,
    orgId,
  }: {
    dealId: string;
    dealInputId: string | null;
    rawText: string;
    assetType: string | null;
    market: string | null;
    createdBy: string;
    orgId: string;
  }
): Promise<string | null> {
  console.info("[runDemoScan] starting", { dealId, dealInputId: dealInputId ?? "none" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[runDemoScan] OPENAI_API_KEY not set — scan aborted");
    return null;
  }

  const client = new OpenAI({ apiKey });
  let completion: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        { role: "system", content: DEAL_SCAN_SYSTEM_PROMPT },
        { role: "user", content: rawText || "No underwriting text provided." },
      ],
    });
  } catch (err) {
    console.error("[runDemoScan] OpenAI call failed:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
    return null;
  }

  const content = completion.choices?.[0]?.message?.content ?? "";
  const model = completion.model ?? "gpt-4o";

  const normalized = parseAndNormalizeDealScan(content);
  if (!normalized) {
    console.error("[runDemoScan] Failed to parse scan output — inserting failed scan row", { dealId });
    await service.from("deal_scans").insert({
      deal_id: dealId,
      deal_input_id: dealInputId,
      input_text_hash: rawText ? inputTextHash(rawText) : null,
      extraction: {},
      status: "failed",
      model,
      prompt_version: DEAL_SCAN_PROMPT_VERSION,
    });
    return null;
  }

  const { assumptions: assumptionsForScoring, unitInferred } =
    normalizeAssumptionsForScoringWithFlags(normalized.assumptions);
  const { applySeverityOverride, shouldRemoveDataMissing, shouldRemoveExitCapCompression, shouldRemoveExpenseUnderstated } = await import("@/lib/riskSeverityOverrides");
  const { hasConstructionKeyword } = await import("@/lib/riskInjection");
  const overrideContext = { hasConstructionKeywords: hasConstructionKeyword(rawText) };
  let stabilizedRisks = normalized.risks.map((r) => ({
    ...r,
    severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring, overrideContext),
  }));

  // Remove risks that deterministic rules say should not exist
  if (shouldRemoveDataMissing(assumptionsForScoring)) {
    stabilizedRisks = stabilizedRisks.filter((r) => r.risk_type !== "DataMissing");
  }
  if (shouldRemoveExitCapCompression(assumptionsForScoring)) {
    stabilizedRisks = stabilizedRisks.filter((r) => r.risk_type !== "ExitCapCompression");
  }
  if (shouldRemoveExpenseUnderstated(assumptionsForScoring)) {
    stabilizedRisks = stabilizedRisks.filter((r) => r.risk_type !== "ExpenseUnderstated");
  }

  const completedAt = new Date().toISOString();
  const scanRow = {
    deal_id: dealId,
    deal_input_id: dealInputId,
    input_text_hash: rawText ? inputTextHash(rawText) : null,
    extraction: normalized as unknown as Record<string, unknown>,
    status: "completed",
    completed_at: completedAt,
    model,
    prompt_version: DEAL_SCAN_PROMPT_VERSION,
    cap_rate_in: normalized.assumptions.cap_rate_in?.value ?? null,
    exit_cap: normalized.assumptions.exit_cap?.value ?? null,
    noi_year1: normalized.assumptions.noi_year1?.value ?? null,
    ltv: normalized.assumptions.ltv?.value ?? null,
    hold_period_years: normalized.assumptions.hold_period_years?.value ?? null,
    asset_type: assetType,
    market,
  };

  // Direct insert — bypass create_deal_scan_with_usage_check RPC (demo scan is free)
  const { data: scanInsert, error: scanInsertError } = await service
    .from("deal_scans")
    .insert(scanRow)
    .select("id")
    .single();

  if (scanInsertError || !scanInsert) {
    console.error("[runDemoScan] scan insert error:", scanInsertError?.message ?? scanInsertError, scanInsertError?.code, { dealId });
    return null;
  }

  const scanId = (scanInsert as { id: string }).id;

  const risksToInsert = stabilizedRisks.map((r) => ({
    deal_scan_id: scanId,
    risk_type: r.risk_type,
    severity_original: r.severity,
    severity_current: r.severity_current,
    what_changed_or_trigger: r.what_changed_or_trigger,
    why_it_matters: r.why_it_matters,
    who_this_affects: r.who_this_affects,
    recommended_action: r.recommended_action,
    confidence: r.confidence,
    evidence_snippets: r.evidence_snippets,
  }));
  if (risksToInsert.length > 0) {
    await service.from("deal_risks").insert(risksToInsert);
  }

  // Run macro overlay
  try {
    const { runOverlay } = await import("@/lib/crossReferenceOverlay");
    await runOverlay(service, scanId, createdBy, { asset_type: assetType, market });
  } catch (err) {
    console.error("[runDemoScan] overlay error (non-fatal):", err);
  }

  // Macro signal count
  let macroLinkedCount = 0;
  let macroDecayedWeight: number | undefined;
  let macroTimestampMissing = false;

  try {
    const { data: riskRows } = await service
      .from("deal_risks")
      .select("id")
      .eq("deal_scan_id", scanId);
    const riskIds = (riskRows ?? []).map((r: { id: string }) => r.id);
    if (riskIds.length > 0) {
      const { data: linkRows } = await service
        .from("deal_signal_links")
        .select("deal_risk_id, signal_id, created_at")
        .in("deal_risk_id", riskIds);
      const links = (linkRows ?? []) as { deal_risk_id: string; signal_id: string; created_at?: string }[];
      const signalIds = [...new Set(links.map((l) => l.signal_id))];
      let signalsMap: Record<string, { signal_type: string | null; created_at?: string }> = {};
      if (signalIds.length > 0) {
        const { data: signalRows } = await service
          .from("signals")
          .select("id, signal_type, created_at")
          .in("id", signalIds);
        for (const s of (signalRows ?? []) as { id: string; signal_type: string | null; created_at?: string }[]) {
          signalsMap[String(s.id)] = { signal_type: s.signal_type ?? null, created_at: s.created_at };
        }
      }
      const { countUniqueMacroCategories, computeDecayedMacroWeight } = await import("@/lib/macroSignalCount");
      const linksWithCategory = links.map((l) => ({
        deal_risk_id: l.deal_risk_id,
        signal_id: l.signal_id,
        signal_type: signalsMap[String(l.signal_id)]?.signal_type ?? null,
      }));
      macroLinkedCount = countUniqueMacroCategories(linksWithCategory);
      const linksWithTimestamp = links.map((l) => {
        const sig = signalsMap[String(l.signal_id)];
        const timestamp = l.created_at ?? sig?.created_at ?? null;
        return { deal_risk_id: l.deal_risk_id, signal_id: l.signal_id, signal_type: sig?.signal_type ?? null, timestamp };
      });
      if (linksWithTimestamp.some((l) => l.timestamp != null)) {
        macroDecayedWeight = computeDecayedMacroWeight(linksWithTimestamp);
      }
      macroTimestampMissing = linksWithTimestamp.some((l) => l.timestamp == null);
    }
  } catch (err) {
    console.error("[runDemoScan] macro signal count error (non-fatal):", err);
  }

  // Compute risk index
  const { computeRiskIndex, RISK_INDEX_VERSION } = await import("@/lib/riskIndex");
  const riskIndex = computeRiskIndex({
    risks: stabilizedRisks.map((r) => ({
      severity_current: r.severity_current,
      confidence: r.confidence,
      risk_type: r.risk_type,
    })),
    assumptions: assumptionsForScoring,
    macroLinkedCount,
    macroDecayedWeight,
  });

  let breakdown = riskIndex.breakdown;
  if (macroTimestampMissing) {
    const flags = (breakdown.edge_flags ?? []).slice();
    if (!flags.includes("EDGE_MACRO_TIMESTAMP_MISSING")) flags.push("EDGE_MACRO_TIMESTAMP_MISSING");
    breakdown = { ...breakdown, edge_flags: flags };
  }
  if (unitInferred) {
    const flags = (breakdown.edge_flags ?? []).slice();
    if (!flags.includes("EDGE_UNIT_INFERRED")) flags.push("EDGE_UNIT_INFERRED");
    breakdown = { ...breakdown, edge_flags: flags, review_flag: true };
  }

  try {
    const { getPortfolioPurchasePriceP80 } = await import("@/lib/portfolioSummary");
    const p80 = await getPortfolioPurchasePriceP80(service, orgId);
    const purchasePrice = assumptionsForScoring.purchase_price?.value;
    if (p80 != null && typeof purchasePrice === "number" && purchasePrice >= p80) {
      breakdown = { ...breakdown, exposure_bucket: "High" as const };
    } else if (breakdown.exposure_bucket !== "High") {
      breakdown = { ...breakdown, exposure_bucket: "Normal" as const };
    }
  } catch {
    // non-fatal
  }

  const score = Math.max(0, Math.min(100, riskIndex.score));
  const band = ["Low", "Moderate", "Elevated", "High"].includes(riskIndex.band) ? riskIndex.band : "Moderate";

  const { error: finalizeError } = await service.rpc("finalize_scan_risk_and_history", {
    p_scan_id: scanId,
    p_deal_id: dealId,
    p_score: score,
    p_band: band,
    p_completed_at: completedAt,
    p_breakdown: breakdown,
    p_version: RISK_INDEX_VERSION,
    p_macro_linked_count: macroLinkedCount,
    p_percentile: null,
    p_snapshot_id: null,
  });
  if (finalizeError) {
    console.warn("[runDemoScan] finalize_scan_risk_and_history error (non-fatal):", finalizeError);
  }

  await service.from("risk_audit_log").insert({
    deal_id: dealId,
    scan_id: scanId,
    previous_score: null,
    new_score: score,
    delta: null,
    band_change: null,
    model_version: RISK_INDEX_VERSION,
    created_at: completedAt,
  }).then(({ error }) => {
    if (error && (error as { code?: string }).code !== "23505") {
      console.warn("[runDemoScan] risk_audit_log insert error (non-fatal):", error);
    }
  });

  const { data: dealRow } = await service
    .from("deals")
    .select("scan_count")
    .eq("id", dealId)
    .single();
  const currentScanCount = (dealRow as { scan_count?: number } | null)?.scan_count ?? 0;

  await service.from("deals").update({
    latest_scan_id: scanId,
    latest_risk_score: score,
    latest_risk_band: band,
    latest_scanned_at: completedAt,
    scan_count: currentScanCount + 1,
    updated_at: completedAt,
  }).eq("id", dealId);

  console.info("[runDemoScan] completed", { scan_id: scanId, deal_id: dealId, score, band });
  return scanId;
}
