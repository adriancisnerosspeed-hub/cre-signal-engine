import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser, getEntitlementsForUser } from "@/lib/entitlements";
import { getDealScansToday, getTotalFullScansUsed, incrementDealScanUsage, incrementTotalFullScans } from "@/lib/usage";
import { parseAndNormalizeDealScan } from "@/lib/dealScanContract";
import { normalizeAssumptionsForScoring } from "@/lib/assumptionNormalization";
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

  let body: { deal_id?: string; deal_input_id?: string; force?: number };
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

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, organization_id, created_by, asset_type, market")
    .eq("id", dealId)
    .single();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const plan = await getPlanForUser(service, user.id);
  const entitlements = await getEntitlementsForUser(service, user.id);

  // Free: lifetime cap only. Block before any OpenAI calls.
  if (plan === "free" && entitlements.lifetime_full_scan_limit != null) {
    const used = await getTotalFullScansUsed(service, user.id);
    const limit = entitlements.lifetime_full_scan_limit;
    if (used >= limit) {
      return NextResponse.json(
        {
          code: "LIFETIME_LIMIT_REACHED",
          used,
          limit,
          message: "Institutional features require Pro access.",
        },
        { status: 429 }
      );
    }
  }

  // Pro/Owner: daily cap only.
  if (plan !== "free") {
    const limit = entitlements.deal_scans_per_day;
    const used = await getDealScansToday(service, user.id);
    if (used >= limit) {
      return NextResponse.json(
        {
          code: "DAILY_LIMIT_REACHED",
          limit,
          used,
          plan,
          upgrade_url: "/pricing",
        },
        { status: 429 }
      );
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

  const assumptionsForScoring = normalizeAssumptionsForScoring(normalized.assumptions);
  const extraction = normalized as unknown as Record<string, unknown>;
  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .insert({
      deal_id: dealId,
      deal_input_id: dealInputId,
      input_text_hash: rawText ? inputTextHash(rawText) : null,
      extraction,
      status: "completed",
      completed_at: new Date().toISOString(),
      model,
      prompt_version: DEAL_SCAN_PROMPT_VERSION,
      cap_rate_in: normalized.assumptions.cap_rate_in?.value ?? null,
      exit_cap: normalized.assumptions.exit_cap?.value ?? null,
      noi_year1: normalized.assumptions.noi_year1?.value ?? null,
      ltv: normalized.assumptions.ltv?.value ?? null,
      hold_period_years: normalized.assumptions.hold_period_years?.value ?? null,
      asset_type: (deal as { asset_type?: string | null }).asset_type ?? null,
      market: (deal as { market?: string | null }).market ?? null,
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    console.error("deal_scans insert error:", scanError);
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
  }

  const { applySeverityOverride } = await import("@/lib/riskSeverityOverrides");
  const stabilizedRisks = normalized.risks.map((r) => ({
    ...r,
    severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring),
  }));

  for (const r of stabilizedRisks) {
    await service.from("deal_risks").insert({
      deal_scan_id: scan.id,
      risk_type: r.risk_type,
      severity_original: r.severity,
      severity_current: r.severity_current,
      what_changed_or_trigger: r.what_changed_or_trigger,
      why_it_matters: r.why_it_matters,
      who_this_affects: r.who_this_affects,
      recommended_action: r.recommended_action,
      confidence: r.confidence,
      evidence_snippets: r.evidence_snippets,
    });
  }

  const { runOverlay } = await import("@/lib/crossReferenceOverlay");
  await runOverlay(service, scan.id, deal.created_by, {
    asset_type: (deal as { asset_type?: string | null }).asset_type ?? null,
    market: (deal as { market?: string | null }).market ?? null,
  }).catch((err) => {
    console.error("Overlay error:", err);
  });

  let previousScore: number | undefined;
  const { data: prevScan } = await service
    .from("deal_scans")
    .select("risk_index_score")
    .eq("deal_id", dealId)
    .eq("status", "completed")
    .neq("id", scan.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevScan && typeof (prevScan as { risk_index_score?: number }).risk_index_score === "number") {
    previousScore = (prevScan as { risk_index_score: number }).risk_index_score;
  }

  const { data: riskRows } = await service
    .from("deal_risks")
    .select("id, severity_current, confidence, risk_type")
    .eq("deal_scan_id", scan.id);
  const riskIds = (riskRows ?? []).map((r: { id: string }) => r.id);
  let macroLinkedCount = 0;
  let macroDecayedWeight: number | undefined;
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
  }
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
    ...(previousScore != null && { previous_score: previousScore }),
  });

  const purchasePrice = assumptionsForScoring.purchase_price?.value;
  let breakdown = riskIndex.breakdown;
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

  const completedAt = new Date().toISOString();

  await service
    .from("deal_scans")
    .update({
      risk_index_score: score,
      risk_index_band: band,
      risk_index_breakdown: breakdown,
      risk_index_version: RISK_INDEX_VERSION,
      macro_linked_count: macroLinkedCount,
    })
    .eq("id", scan.id);

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

  if (plan === "free") {
    await incrementTotalFullScans(service, user.id);
  } else {
    await incrementDealScanUsage(service, user.id, orgId);
  }

  return NextResponse.json({ scan_id: scan.id, deal_id: dealId });
}
