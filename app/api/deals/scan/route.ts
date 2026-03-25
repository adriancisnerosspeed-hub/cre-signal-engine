import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile, isOwner } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { getPlanForUser } from "@/lib/entitlements";
import { parseAndNormalizeDealScan } from "@/lib/dealScanContract";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { DEAL_SCAN_SYSTEM_PROMPT, DEAL_SCAN_PROMPT_VERSION } from "@/lib/prompts/dealScanPrompt";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { checkOrgScanRateLimit } from "@/lib/rateLimit";
import { captureServerEvent } from "@/lib/posthogServer";

export const runtime = "nodejs";

function inputTextHash(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Normalize raw text before hashing: collapse whitespace, normalize line endings, trim. */
function normalizeRawText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
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
  const ownerForce = forceRescan && isOwner(user.email ?? "");
  if (ownerForce) {
    console.info("[deal_scan] force_rescan", { user: user.email });
  }
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

  const normalizedText = rawText ? normalizeRawText(rawText) : "";

  if (!forceRescan && rawText) {
    const hash = inputTextHash(normalizedText);
    const SCAN_CACHE_TTL_HOURS = parseInt(process.env.SCAN_CACHE_TTL_HOURS || "168", 10);
    const cacheWindow = new Date(Date.now() - SCAN_CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from("deal_scans")
      .select("id, risk_index_score, risk_index_band")
      .eq("deal_id", dealId)
      .eq("input_text_hash", hash)
      .eq("status", "completed")
      .gte("created_at", cacheWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.info("[SCAN CACHE] Layer 1 hit (input_text_hash, no force)", {
        deal_id: dealId, hash: hash.slice(0, 12), cached_scan_id: existing.id,
      });
      return NextResponse.json({
        scan_id: existing.id, deal_id: dealId, reused: true,
        risk_index_score: existing.risk_index_score,
        risk_index_band: existing.risk_index_band,
      });
    }
  }

  // Authoritative text-hash cache: if same raw text was ever scored for this deal,
  // reuse that score. Prevents AI extraction non-determinism from causing score drift.
  // Applies even when force=1, UNLESS owner force rescan (bypasses all caches).
  if (rawText && !ownerForce) {
    const textHash = inputTextHash(normalizedText);
    const { data: priorScored } = await service
      .from("deal_scans")
      .select("id, risk_index_score, risk_index_band, risk_index_breakdown")
      .eq("deal_id", dealId)
      .eq("input_text_hash", textHash)
      .eq("status", "completed")
      .not("risk_index_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorScored?.risk_index_score != null) {
      console.info("[SCAN CACHE] text-hash score reuse (force-safe)", {
        deal_id: dealId, hash: textHash.slice(0, 12),
        cached_scan_id: priorScored.id,
        score: priorScored.risk_index_score, band: priorScored.risk_index_band,
      });
      return NextResponse.json({
        scan_id: priorScored.id, deal_id: dealId, reused: true,
        risk_index_score: priorScored.risk_index_score,
        risk_index_band: priorScored.risk_index_band,
        risk_index_breakdown: priorScored.risk_index_breakdown,
      });
    } else {
      console.info("[SCAN CACHE] Text hash match but no completed score — proceeding normally", {
        deal_id: dealId, hash: textHash.slice(0, 12),
      });
    }
  }

  const platformPlan = await getPlanForUser(service, user.id);
  const isPlatformAdmin = platformPlan === "platform_admin";

  if (!isPlatformAdmin) {
    const dealOrgId = (deal as { organization_id: string }).organization_id;
    const limit = await checkOrgScanRateLimit(service, dealOrgId);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Too many scans for this workspace. Try again in a little while.",
          code: "SCAN_RATE_LIMIT",
          retry_after_sec: limit.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec ?? 3600) },
        }
      );
    }
  }

  // Monthly scan limit enforcement (PRO/Starter plan: 10/month)
  if (!isPlatformAdmin) {
    const { getWorkspacePlanAndEntitlements } = await import("@/lib/entitlements/workspace");
    const { entitlements } = await getWorkspacePlanAndEntitlements(service, dealOrgId);

    if (entitlements.maxScansPerMonth !== null) {
      const { getMonthlyScansUsed } = await import("@/lib/usage");
      const monthlyUsed = await getMonthlyScansUsed(service, dealOrgId);

      if (monthlyUsed >= entitlements.maxScansPerMonth) {
        return NextResponse.json(
          {
            error: "Monthly scan limit reached. Upgrade for unlimited scans.",
            code: "MONTHLY_SCAN_LIMIT",
            scans_used: monthlyUsed,
            scans_limit: entitlements.maxScansPerMonth,
          },
          {
            status: 429,
            headers: { "Retry-After": "86400" },
          }
        );
      }
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    // Pinned to March 2026 snapshot for extraction determinism
    model: "gpt-5.4-mini-2026-03-17",
    temperature: 0,
    top_p: 1,
    seed: 42,
    frequency_penalty: 0.1,
    presence_penalty: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DEAL_SCAN_SYSTEM_PROMPT },
      { role: "user", content: rawText || "No underwriting text provided." },
    ],
  });

  const model = completion.model ?? "gpt-5.4-mini";
  console.log(`Extraction model used: ${model}, temperature=0, seed=42`);
  const content = completion.choices?.[0]?.message?.content ?? "";

  // If extraction returned insufficient_data, return 400 without consuming a scan.
  try {
    const raw = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(raw) as { scan_status?: string; message?: string };
    if (parsed?.scan_status === "insufficient_data" && typeof parsed?.message === "string") {
      return NextResponse.json(
        { error: parsed.message },
        { status: 400 }
      );
    }
  } catch {
    // Not JSON or not insufficient_data; continue to normal parse.
  }

  const normalized = parseAndNormalizeDealScan(content);
  if (!normalized) {
    const { data: failedScan } = await service
      .from("deal_scans")
      .insert({
        deal_id: dealId,
        deal_input_id: dealInputId,
        input_text_hash: rawText ? inputTextHash(normalizedText) : null,
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

  // === RISK INJECTION LAYER ===
  // Inject deterministic risks that the numbers mathematically warrant
  // but the AI may have non-deterministically omitted.
  const { injectDeterministicRisks } = await import("@/lib/riskInjection");
  const injectionResult = injectDeterministicRisks(
    assumptionsForScoring,
    normalized.risks,
    normalizedText
  );
  const risksAfterInjection = injectionResult.risks;
  const injectedRiskTypes = injectionResult.injectedTypes;

  if (injectedRiskTypes.size > 0) {
    console.info("[deal_scan] risk_injection", {
      deal_id: dealId,
      injected: [...injectedRiskTypes],
      count: injectedRiskTypes.size,
    });
  }

  const { applySeverityOverride, shouldRemoveDataMissing, shouldRemoveExitCapCompression, shouldRemoveExpenseUnderstated } = await import("@/lib/riskSeverityOverrides");
  const { hasConstructionKeyword } = await import("@/lib/riskInjection");
  const overrideContext = { hasConstructionKeywords: hasConstructionKeyword(normalizedText) };
  let stabilizedRisks = risksAfterInjection.map((r) => ({
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

  // Canonical scoring-input hash: deterministic fingerprint of normalized inputs.
  // Used for post-normalization cache so identical normalized inputs always produce identical scores.
  const canonicalScoringInput = JSON.stringify({
    risks: stabilizedRisks
      .map((r) => ({ risk_type: r.risk_type, severity_current: r.severity_current, confidence: r.confidence }))
      .sort((a, b) => a.risk_type.localeCompare(b.risk_type)),
    assumptions: Object.entries(assumptionsForScoring)
      .filter(([, v]) => v?.value != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v?.value]),
  });
  const scoringInputHash = inputTextHash(canonicalScoringInput);

  const completedAt = new Date().toISOString();
  const p_scan_row = {
    deal_input_id: dealInputId,
    input_text_hash: rawText ? inputTextHash(normalizedText) : null,
    scoring_input_hash: scoringInputHash,
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

  let scanId: string;

  if (isPlatformAdmin) {
    const { data: scanInsert, error: scanInsertError } = await service
      .from("deal_scans")
      .insert({
        deal_id: dealId,
        deal_input_id: p_scan_row.deal_input_id ?? null,
        input_text_hash: p_scan_row.input_text_hash ?? null,
        scoring_input_hash: p_scan_row.scoring_input_hash ?? null,
        extraction: p_scan_row.extraction as Record<string, unknown>,
        status: p_scan_row.status,
        completed_at: p_scan_row.completed_at,
        model: p_scan_row.model,
        prompt_version: p_scan_row.prompt_version,
        cap_rate_in: p_scan_row.cap_rate_in ?? null,
        exit_cap: p_scan_row.exit_cap ?? null,
        noi_year1: p_scan_row.noi_year1 ?? null,
        ltv: p_scan_row.ltv ?? null,
        hold_period_years: p_scan_row.hold_period_years ?? null,
        asset_type: p_scan_row.asset_type ?? null,
        market: p_scan_row.market ?? null,
      })
      .select("id")
      .single();

    if (scanInsertError || !scanInsert) {
      console.error("[deal_scan] platform_admin direct insert error:", scanInsertError);
      return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
    }

    scanId = (scanInsert as { id: string }).id;

    if (p_risks.length > 0) {
      await service.from("deal_risks").insert(
        p_risks.map((r) => ({ ...r, deal_scan_id: scanId }))
      );
    }
  } else {
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
    scanId = row.scan_id as string;
    if (!scanId) {
      return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
    }
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
      macroDecayedWeight = computeDecayedMacroWeight(linksWithTimestamp, new Date(completedAt));
    }
    macroTimestampMissing = linksWithTimestamp.some((l) => l.timestamp == null);
  }
  const { computeRiskIndex, RISK_INDEX_VERSION } = await import("@/lib/riskIndex");

  // Log scoring inputs hash for determinism audit trail
  console.info("[deal_scan] scoring_inputs", { scan_id: scan.id, deal_id: dealId, scoring_input_hash: scoringInputHash });

  // Scoring-input cache: if a previous scan on the same deal produced identical normalized inputs, reuse exact score.
  // Owner force rescan bypasses this cache to allow full recomputation.
  let cachedScore: { risk_index_score: number | null; risk_index_band: string | null; risk_index_breakdown: Record<string, unknown> | null; macro_linked_count: number | null } | null = null;
  if (!ownerForce) {
    const SCORING_CACHE_TTL_HOURS = parseInt(process.env.SCAN_CACHE_TTL_HOURS || "168", 10);
    const scoringCacheWindow = new Date(Date.now() - SCORING_CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await service
      .from("deal_scans")
      .select("risk_index_score, risk_index_band, risk_index_breakdown, macro_linked_count")
      .eq("deal_id", dealId)
      .eq("scoring_input_hash", scoringInputHash)
      .eq("status", "completed")
      .not("risk_index_score", "is", null)
      .gte("created_at", scoringCacheWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cachedScore = data;
  }

  const riskFingerprint = stabilizedRisks
    .map((r) => `${r.risk_type}:${r.severity_current}`)
    .sort()
    .join("|");

  const deltaComparable = previousScore != null && previousVersion === RISK_INDEX_VERSION;

  let score: number;
  let band: string;
  let breakdown: Record<string, unknown>;

  if (cachedScore?.risk_index_score != null && cachedScore?.risk_index_band) {
    // Cache hit: reuse exact score/band/breakdown from previous identical-input scan
    score = cachedScore.risk_index_score as number;
    band = cachedScore.risk_index_band as string;
    breakdown = (cachedScore.risk_index_breakdown as Record<string, unknown>) ?? {};
    breakdown.risk_fingerprint = riskFingerprint;
    console.info("[deal_scan] scoring_input_cache_hit", { scan_id: scan.id, deal_id: dealId, score, band });
  } else {
    // Cache miss: compute fresh score
    console.info("[SCAN CACHE] Layer 2 miss (scoring_input_hash) — computing fresh score", {
      deal_id: dealId, scoring_input_hash: scoringInputHash.slice(0, 12),
    });
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
    let bd = riskIndex.breakdown;
    if (previousScore != null && !deltaComparable) {
      bd = {
        ...bd,
        previous_score: previousScore,
        delta_comparable: false,
        delta_score: undefined,
        delta_band: undefined,
        deterioration_flag: undefined,
      };
    }
    if (macroTimestampMissing) {
      const flags = (bd.edge_flags ?? []).slice();
      if (!flags.includes("EDGE_MACRO_TIMESTAMP_MISSING")) flags.push("EDGE_MACRO_TIMESTAMP_MISSING");
      bd = { ...bd, edge_flags: flags };
    }
    if (unitInferred) {
      const flags = (bd.edge_flags ?? []).slice();
      if (!flags.includes("EDGE_UNIT_INFERRED")) flags.push("EDGE_UNIT_INFERRED");
      bd = { ...bd, edge_flags: flags, review_flag: true };
    }
    try {
      const { getPortfolioPurchasePriceP80 } = await import("@/lib/portfolioSummary");
      const p80 = await getPortfolioPurchasePriceP80(service, orgId);
      if (p80 != null && typeof purchasePrice === "number" && purchasePrice >= p80) {
        bd = { ...bd, exposure_bucket: "High" as const };
        if ((riskIndex.band === "Elevated" || riskIndex.band === "High") && bd.exposure_bucket === "High") {
          bd = { ...bd, alert_tags: ["HIGH_IMPACT_RISK"] };
        }
      } else if (bd.exposure_bucket !== "High") {
        bd = { ...bd, exposure_bucket: "Normal" as const };
      }
    } catch {
      // optional: leave exposure_bucket unset if portfolio query fails
    }

    // Enforce scan invariants: score 0–100, band in allowed set
    score = Math.max(0, Math.min(100, riskIndex.score));
    band = ["Low", "Moderate", "Elevated", "High"].includes(riskIndex.band) ? riskIndex.band : "Moderate";
    breakdown = {
      ...bd,
      risk_fingerprint: riskFingerprint,
      ...(injectedRiskTypes.size > 0 && { injected_risk_types: [...injectedRiskTypes] }),
    };
    console.info("[SCAN CACHE] Miss → new score:", { deal_id: dealId, score, band });
  }

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

  const bdAny = breakdown as Record<string, unknown>;
  const auditInsert = await service.from("risk_audit_log").insert({
    deal_id: dealId,
    scan_id: scan.id,
    previous_score: previousScore ?? null,
    new_score: score,
    delta: (bdAny.delta_score as number | null) ?? null,
    band_change: (bdAny.delta_band as string | null) ?? null,
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

  // Increment monthly scan usage (after successful scan finalization)
  if (!isPlatformAdmin) {
    const { incrementMonthlyScanUsage } = await import("@/lib/usage");
    try {
      await incrementMonthlyScanUsage(service, dealOrgId);
    } catch (err) {
      console.warn("[deal_scan] monthly_scan_usage increment failed (non-fatal):", err);
    }
  }

  const assumptionKeys = Object.keys(normalized.assumptions).length;
  console.info("[deal_scan] completed", {
    scan_id: scan.id,
    deal_id: dealId,
    model,
    temperature: 0,
    seed: 42,
    risk_count: risksAfterInjection.length,
    risk_count_ai: normalized.risks.length,
    risk_count_injected: injectedRiskTypes.size,
    assumption_keys: assumptionKeys,
    score,
    tier: band,
    macro_linked_count: macroLinkedCount,
  });

  await captureServerEvent(user.id, "deal_scan_completed", {
    scan_id: scan.id,
    deal_id: dealId,
    risk_band: band,
    risk_score: score,
  });

  return NextResponse.json({ scan_id: scan.id, deal_id: dealId });
}
