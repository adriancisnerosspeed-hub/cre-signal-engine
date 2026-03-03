import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { parseAndNormalizeDealScan } from "@/lib/dealScanContract";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { DEAL_SCAN_SYSTEM_PROMPT, DEAL_SCAN_PROMPT_VERSION } from "@/lib/prompts/dealScanPrompt";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function inputTextHash(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfile(supabase, user).catch(() => {});

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  let body: {
    deal_id?: string;
    deal_input_id?: string;
    force?: number;
    override_method_lock?: boolean;
    override_reason?: string;
    portfolio_view_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dealId = typeof body.deal_id === "string" ? body.deal_id.trim() : null;
  if (!dealId) {
    return NextResponse.json({ error: "deal_id required" }, { status: 400 });
  }

  const forceRescan = body.force === 1;
  const overrideMethodLock = body.override_method_lock === true;
  const overrideReason = typeof body.override_reason === "string" ? body.override_reason.trim() || null : null;
  const portfolioViewId = typeof body.portfolio_view_id === "string" ? body.portfolio_view_id.trim() || null : null;

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, organization_id, created_by, asset_type, market")
    .eq("id", dealId)
    .single();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const dealOrgId = (deal as { organization_id: string }).organization_id;
  const service = createServiceRoleClient();

  // Methodology lock: only when portfolio_view_id is provided (scan within locked portfolio context).
  if (portfolioViewId) {
    const { data: portfolioView, error: viewError } = await service
      .from("portfolio_views")
      .select("id, organization_id, locked_method_version")
      .eq("id", portfolioViewId)
      .maybeSingle();

    if (viewError || !portfolioView) {
      return NextResponse.json(
        { error: "Portfolio view not found", code: ENTITLEMENT_ERROR_CODES.PORTFOLIO_VIEW_NOT_FOUND },
        { status: 404 }
      );
    }

    const viewOrgId = (portfolioView as { organization_id: string }).organization_id;
    if (viewOrgId !== dealOrgId) {
      return NextResponse.json(
        {
          error: "Portfolio view does not belong to the deal's workspace.",
          code: ENTITLEMENT_ERROR_CODES.PORTFOLIO_CONTEXT_FORBIDDEN,
        },
        { status: 403 }
      );
    }

    const lockedVersion = (portfolioView as { locked_method_version: string | null }).locked_method_version;
    if (lockedVersion) {
      const { RISK_INDEX_VERSION } = await import("@/lib/riskIndex");
      if (lockedVersion !== RISK_INDEX_VERSION) {
        if (!overrideMethodLock) {
          return NextResponse.json(
            {
              error: "Portfolio locked to an older methodology version. Use override to rescore.",
              code: ENTITLEMENT_ERROR_CODES.METHOD_VERSION_LOCKED,
            },
            { status: 403 }
          );
        }
        const { error: logErr } = await service.from("governance_decision_log").insert({
          organization_id: orgId,
          deal_id: dealId,
          snapshot_id: null,
          policy_id: null,
          action_type: "override",
          note: overrideReason ?? "Override and rescore (method version lock)",
          user_id: user.id,
        });
        if (logErr) console.warn("[deal_scan] governance_decision_log override insert failed:", logErr);
      }
    }
  }

  const { data: inputs } = await supabase
    .from("deal_inputs")
    .select("id, raw_text")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1);

  const dealInput = Array.isArray(inputs) && inputs.length > 0 ? inputs[0] : null;
  const rawText = dealInput?.raw_text ?? "";
  const dealInputId = dealInput?.id ?? null;

  if (!forceRescan && rawText) {
    const hash = inputTextHash(rawText);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from("deal_scans")
      .select("id")
      .eq("deal_id", dealId)
      .eq("input_text_hash", hash)
      .eq("status", "completed")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ scan_id: existing.id, deal_id: dealId, reused: true });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: DEAL_SCAN_SYSTEM_PROMPT },
      { role: "user", content: rawText || "No underwriting text provided." },
    ],
  });

  const content = completion.choices?.[0]?.message?.content ?? "";
  const model = completion.model ?? "gpt-4o-mini";

  const normalized = parseAndNormalizeDealScan(content);
  if (!normalized) {
    const { data: failedScan } = await service
      .from("deal_scans")
      .insert({
        deal_id: dealId,
        deal_input_id: dealInputId,
        input_text_hash: rawText ? inputTextHash(rawText) : null,
        extraction: {},
        status: "failed",
        model,
        prompt_version: DEAL_SCAN_PROMPT_VERSION,
      })
      .select("id")
      .single();

    console.warn("[deal_scan] validation_failed", {
      scan_id: failedScan?.id,
      deal_id: dealId,
      model,
      content_length: content?.length ?? 0,
    });
    return NextResponse.json(
      { error: "Failed to parse scan output", scan_id: failedScan?.id },
      { status: 500 }
    );
  }

  const { assumptions: assumptionsForScoring, unitInferred } = normalizeAssumptionsForScoringWithFlags(normalized.assumptions);
  const { applySeverityOverride } = await import("@/lib/riskSeverityOverrides");
  const stabilizedRisks = normalized.risks.map((r) => ({
    ...r,
    severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring),
  }));

  const completedAt = new Date().toISOString();
  const p_scan_row = {
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
    asset_type: (deal as { asset_type?: string | null }).asset_type ?? null,
    market: (deal as { market?: string | null }).market ?? null,
  };
  const p_risks = stabilizedRisks.map((r) => ({
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

  const { data: rpcRows, error: rpcError } = await service.rpc("create_deal_scan_with_usage_check", {
    p_workspace_id: (deal as { organization_id: string }).organization_id,
    p_deal_id: dealId,
    p_scan_row,
    p_risks,
  });
  if (rpcError) {
    console.error("create_deal_scan_with_usage_check error:", rpcError);
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
  }
  const row = Array.isArray(rpcRows) && rpcRows.length > 0 ? rpcRows[0] : null;
  if (!row || typeof row.ok !== "boolean") {
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
  }
  if (!row.ok && row.code === "PLAN_LIMIT_REACHED") {
    return NextResponse.json(
      {
        error: "Workspace has reached the free plan scan limit.",
        code: ENTITLEMENT_ERROR_CODES.PLAN_LIMIT_REACHED,
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }
  if (!row.ok && row.code === "ORGANIZATION_NOT_FOUND") {
    return NextResponse.json({ error: "Workspace not found", code: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
  }
  if (!row.ok) {
    return NextResponse.json({ error: "Failed to save scan", code: "SCAN_SAVE_FAILED" }, { status: 500 });
  }
  const scanId = row.scan_id as string;
  if (!scanId) {
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
  }

  const scan = { id: scanId };

  const { runOverlay } = await import("@/lib/crossReferenceOverlay");
  await runOverlay(service, scan.id, deal.created_by, {
    asset_type: (deal as { asset_type?: string | null }).asset_type ?? null,
    market: (deal as { market?: string | null }).market ?? null,
  }).catch((err) => {
    console.error("Overlay error:", err);
  });

  let previousScore: number | undefined;
  let previousVersion: string | null = null;
  const { data: prevScan } = await service
    .from("deal_scans")
    .select("risk_index_score, risk_index_version")
    .eq("deal_id", dealId)
    .eq("status", "completed")
    .neq("id", scan.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevScan) {
    const score = (prevScan as { risk_index_score?: number }).risk_index_score;
    previousVersion = (prevScan as { risk_index_version?: string | null }).risk_index_version ?? null;
    if (typeof score === "number") previousScore = score;
  }

  const { data: riskRows } = await service
    .from("deal_risks")
    .select("id, severity_current, confidence, risk_type")
    .eq("deal_scan_id", scan.id);
  const riskIds = (riskRows ?? []).map((r: { id: string }) => r.id);
  let macroLinkedCount = 0;
  let macroDecayedWeight: number | undefined;
  let macroTimestampMissing = false;
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
      return {
        deal_risk_id: l.deal_risk_id,
        signal_id: l.signal_id,
        signal_type: sig?.signal_type ?? null,
        timestamp,
      };
    });
    if (linksWithTimestamp.some((l) => l.timestamp != null)) {
      macroDecayedWeight = computeDecayedMacroWeight(linksWithTimestamp);
    }
    macroTimestampMissing = linksWithTimestamp.some((l) => l.timestamp == null);
  }
  const { computeRiskIndex, RISK_INDEX_VERSION } = await import("@/lib/riskIndex");
  const deltaComparable = previousScore != null && previousVersion === RISK_INDEX_VERSION;
  const riskIndex = computeRiskIndex({
    risks: stabilizedRisks.map((r) => ({
      severity_current: r.severity_current,
      confidence: r.confidence,
      risk_type: r.risk_type,
    })),
    assumptions: assumptionsForScoring,
    macroLinkedCount,
    macroDecayedWeight,
    ...(previousScore != null && {
      previous_score: previousScore,
      previous_risk_index_version: previousVersion,
    }),
  });

  const purchasePrice = assumptionsForScoring.purchase_price?.value;
  let breakdown = riskIndex.breakdown;
  if (previousScore != null && !deltaComparable) {
    breakdown = {
      ...breakdown,
      previous_score: previousScore,
      delta_comparable: false,
      delta_score: undefined,
      delta_band: undefined,
      deterioration_flag: undefined,
    };
  }
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
    if (p80 != null && typeof purchasePrice === "number" && purchasePrice >= p80) {
      breakdown = { ...breakdown, exposure_bucket: "High" as const };
      if ((riskIndex.band === "Elevated" || riskIndex.band === "High") && breakdown.exposure_bucket === "High") {
        breakdown = { ...breakdown, alert_tags: ["HIGH_IMPACT_RISK"] };
      }
    } else if (breakdown.exposure_bucket !== "High") {
      breakdown = { ...breakdown, exposure_bucket: "Normal" as const };
    }
  } catch {
    // optional: leave exposure_bucket unset if portfolio query fails
  }

  // Enforce scan invariants: score 0–100, band in allowed set
  const score = Math.max(0, Math.min(100, riskIndex.score));
  const band = ["Low", "Moderate", "Elevated", "High"].includes(riskIndex.band) ? riskIndex.band : "Moderate";

  const { data: finalizeRows, error: finalizeError } = await service.rpc("finalize_scan_risk_and_history", {
    p_scan_id: scan.id,
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
    console.warn("[deal_scan] finalize_scan_risk_and_history RPC error (scan result still persisted):", finalizeError);
  } else {
    const result = Array.isArray(finalizeRows) && finalizeRows.length > 0 ? finalizeRows[0] : null;
    if (result && typeof result.scan_updated === "boolean" && typeof result.history_inserted === "boolean") {
      if (!result.history_inserted) {
        console.warn("[deal_scan] finalize: scan_updated=true, history_inserted=false (idempotent conflict or non-fatal insert failure)", {
          scan_id: scan.id,
        });
      }
    }
  }

  const auditInsert = await service.from("risk_audit_log").insert({
    deal_id: dealId,
    scan_id: scan.id,
    previous_score: previousScore ?? null,
    new_score: score,
    delta: breakdown.delta_score ?? null,
    band_change: breakdown.delta_band ?? null,
    model_version: RISK_INDEX_VERSION,
    created_at: completedAt,
  });
  if (auditInsert.error && (auditInsert.error as { code?: string }).code === "23505") {
    console.warn("[deal_scan] risk_audit_log duplicate scan_id (idempotent skip)", { scan_id: scan.id });
  } else if (auditInsert.error) {
    console.error("[deal_scan] risk_audit_log insert error:", auditInsert.error);
  }

  const { data: dealRow } = await service
    .from("deals")
    .select("scan_count")
    .eq("id", dealId)
    .single();
  const currentScanCount = (dealRow as { scan_count?: number } | null)?.scan_count ?? 0;

  await service
    .from("deals")
    .update({
      latest_scan_id: scan.id,
      latest_risk_score: score,
      latest_risk_band: band,
      latest_scanned_at: completedAt,
      scan_count: currentScanCount + 1,
      updated_at: completedAt,
    })
    .eq("id", dealId);

  const assumptionKeys = Object.keys(normalized.assumptions).length;
  console.info("[deal_scan] completed", {
    scan_id: scan.id,
    deal_id: dealId,
    model,
    risk_count: normalized.risks.length,
    assumption_keys: assumptionKeys,
    score,
    tier: band,
    macro_linked_count: macroLinkedCount,
  });

  return NextResponse.json({ scan_id: scan.id, deal_id: dealId });
}
