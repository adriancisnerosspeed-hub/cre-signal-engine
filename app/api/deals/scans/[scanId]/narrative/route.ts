import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getEntitlementsForUser } from "@/lib/entitlements";
import {
  IC_MEMO_SYSTEM_PROMPT,
  IC_MEMO_PROMPT_VERSION,
  buildIcMemoUserPrompt,
} from "@/lib/prompts/icMemoNarrative";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ScanRow = {
  id: string;
  deal_id: string;
  extraction: Record<string, unknown>;
  risk_index_score: number | null;
  risk_index_band: string | null;
};

type RiskRow = {
  risk_type: string;
  severity_current: string;
  what_changed_or_trigger: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(supabase, user).catch(() => {});
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const { data: scan } = await supabase
    .from("deal_scans")
    .select("id, deal_id")
    .eq("id", scanId)
    .single();
  if (!scan || (scan as { deal_id: string }).deal_id === undefined) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("id", (scan as { deal_id: string }).deal_id)
    .eq("organization_id", orgId)
    .single();
  if (!deal) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const { data: row } = await supabase
    .from("deal_scan_narratives")
    .select("content, model, prompt_version, created_at")
    .eq("deal_scan_id", scanId)
    .maybeSingle();

  if (!row) return NextResponse.json({ narrative: null });
  return NextResponse.json({
    narrative: (row as { content: string }).content,
    model: (row as { model: string | null }).model,
    prompt_version: (row as { prompt_version: string | null }).prompt_version,
    created_at: (row as { created_at: string }).created_at,
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await context.params;
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(supabase, user).catch(() => {});
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const entitlements = await getEntitlementsForUser(service, user.id);
  if (!entitlements.ic_narrative_enabled) {
    return NextResponse.json(
      { error: "IC Memorandum Narrative is a Pro feature" },
      { status: 403 }
    );
  }

  const { data: scan, error: scanError } = await supabase
    .from("deal_scans")
    .select("id, deal_id, extraction, risk_index_score, risk_index_band")
    .eq("id", scanId)
    .single();
  if (scanError || !scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  const s = scan as ScanRow;
  const { data: deal } = await supabase
    .from("deals")
    .select("id, name")
    .eq("id", s.deal_id)
    .eq("organization_id", orgId)
    .single();
  if (!deal) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const { data: riskRows } = await supabase
    .from("deal_risks")
    .select("risk_type, severity_current, what_changed_or_trigger, why_it_matters, who_this_affects")
    .eq("deal_scan_id", scanId)
    .order("created_at", { ascending: true });
  const risks = (riskRows ?? []) as RiskRow[];

  const assumptions = (s.extraction?.assumptions ?? {}) as Record<
    string,
    { value?: number | null; unit?: string | null; confidence?: string }
  >;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const client = new OpenAI({ apiKey });
  const userPrompt = buildIcMemoUserPrompt({
    assumptions,
    risks,
    riskIndexScore: s.risk_index_score,
    riskIndexBand: s.risk_index_band,
    dealName: (deal as { name?: string }).name,
  });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 600,
    messages: [
      { role: "system", content: IC_MEMO_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content =
    completion.choices?.[0]?.message?.content?.trim() ?? "";
  const model = completion.model ?? "gpt-4o-mini";

  const { error: upsertError } = await service
    .from("deal_scan_narratives")
    .upsert(
      {
        deal_scan_id: scanId,
        content,
        model,
        prompt_version: IC_MEMO_PROMPT_VERSION,
      },
      { onConflict: "deal_scan_id" }
    );

  if (upsertError) {
    console.error("deal_scan_narratives upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to save narrative" }, { status: 500 });
  }

  return NextResponse.json({ narrative: content, model, prompt_version: IC_MEMO_PROMPT_VERSION });
}
