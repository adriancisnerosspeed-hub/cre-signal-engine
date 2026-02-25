import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser, getEntitlementsForUser } from "@/lib/entitlements";
import { getDealScansToday, getTotalFullScansUsed, incrementDealScanUsage, incrementTotalFullScans } from "@/lib/usage";
import { parseAndNormalizeDealScan } from "@/lib/dealScanContract";
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

    return NextResponse.json(
      { error: "Failed to parse scan output", scan_id: failedScan?.id },
      { status: 500 }
    );
  }

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

  for (const r of normalized.risks) {
    await service.from("deal_risks").insert({
      deal_scan_id: scan.id,
      risk_type: r.risk_type,
      severity_original: r.severity,
      severity_current: r.severity,
      what_changed_or_trigger: r.what_changed_or_trigger,
      why_it_matters: r.why_it_matters,
      who_this_affects: r.who_this_affects,
      recommended_action: r.recommended_action,
      confidence: r.confidence,
      evidence_snippets: r.evidence_snippets,
    });
  }

  await service
    .from("deals")
    .update({ latest_scan_id: scan.id, updated_at: new Date().toISOString() })
    .eq("id", dealId);

  const { runOverlay } = await import("@/lib/crossReferenceOverlay");
  await runOverlay(service, scan.id, deal.created_by).catch((err) => {
    console.error("Overlay error:", err);
  });

  const { data: riskRows } = await service
    .from("deal_risks")
    .select("severity_current, confidence, risk_type")
    .eq("deal_scan_id", scan.id);
  const risks = (riskRows ?? []) as { severity_current: string; confidence: string | null; risk_type: string }[];
  const { computeRiskIndex } = await import("@/lib/riskIndex");
  const riskIndex = computeRiskIndex(risks, DEAL_SCAN_PROMPT_VERSION);
  await service
    .from("deal_scans")
    .update({
      risk_index_score: riskIndex.score,
      risk_index_band: riskIndex.band,
      risk_index_breakdown: riskIndex.breakdown,
    })
    .eq("id", scan.id);

  if (plan === "free") {
    await incrementTotalFullScans(service, user.id);
  } else {
    await incrementDealScanUsage(service, user.id, orgId);
  }

  return NextResponse.json({ scan_id: scan.id, deal_id: dealId });
}
