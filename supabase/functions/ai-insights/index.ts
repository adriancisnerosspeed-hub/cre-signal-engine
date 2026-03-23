import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// Required Supabase secret: OPENAI_API_KEY
// Deploy: npx supabase functions deploy ai-insights
// Set secret: npx supabase secrets set OPENAI_API_KEY=sk-...

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_DISCLAIMER =
  "Supplemental predictive layer — not deterministic; does not replace the CRE Signal Risk Index™ or human underwriting judgment.";

type InsightItem = {
  text: string;
  source?: string;
  confidence?: string;
  macro_context?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Early safety check: surface missing API key immediately
  if (!Deno.env.get("OPENAI_API_KEY")) {
    console.error("[ai-insights] Missing OPENAI_API_KEY");
    return jsonResponse({ error: "Configuration error: API key missing" }, 500);
  }

  try {

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  let body: { deal_scan_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const deal_scan_id =
    typeof body.deal_scan_id === "string" ? body.deal_scan_id.trim() : "";
  if (!deal_scan_id) {
    return jsonResponse({ error: "deal_scan_id required" }, 400);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: scan, error: scanErr } = await supabaseUser
    .from("deal_scans")
    .select("id, deal_id, extraction, risk_index_score, risk_index_band, status")
    .eq("id", deal_scan_id)
    .maybeSingle();

  if (scanErr || !scan) {
    return jsonResponse({ error: "Scan not found" }, 404);
  }

  const { data: risks, error: risksErr } = await supabaseUser
    .from("deal_risks")
    .select(
      "risk_type, severity_current, what_changed_or_trigger, why_it_matters, confidence"
    )
    .eq("deal_scan_id", deal_scan_id)
    .order("created_at", { ascending: true });

  if (risksErr) {
    return jsonResponse({ error: "Failed to load risks" }, 500);
  }

  const assumptions = (scan.extraction as Record<string, unknown> | null)?.assumptions ?? {};
  const riskLines = (risks ?? [])
    .slice(0, 40)
    .map(
      (r: {
        risk_type: string;
        severity_current: string;
        what_changed_or_trigger: string | null;
        why_it_matters: string | null;
        confidence: string | null;
      }) =>
        `- ${r.risk_type} (${r.severity_current})${r.what_changed_or_trigger ? `: ${r.what_changed_or_trigger}` : ""}${r.why_it_matters ? ` — ${r.why_it_matters}` : ""}`
    )
    .join("\n");

  const systemPrompt = `You are a senior commercial real estate research assistant. Your output is SUPPLEMENTAL ONLY: market context, macro overlays, and qualitative signals. You must NOT change, reinterpret, or replace any numeric risk index or deterministic score. Return a single JSON object with this exact shape:
{"insights":[{"text":"string (required)","source":"macro|market|sentiment|regulatory|other","confidence":"low|medium|high","macro_context":"short string"}],"disclaimer":"optional short string"}
Provide 4–8 insight objects. Be specific to the asset context when possible; avoid repeating the risk list verbatim. No markdown, no code fences.`;

  const userPrompt = `Deal scan snapshot (supplemental context only):
Risk index (informational): ${scan.risk_index_score ?? "n/a"} / band: ${scan.risk_index_band ?? "n/a"} / status: ${scan.status ?? "n/a"}
Key assumptions (JSON excerpt): ${JSON.stringify(assumptions).slice(0, 6000)}
Flagged risks summary:
${riskLines || "(none)"}`;

  // Pinned to March 2026 snapshot for consistency with scan route
  const model = "gpt-5.4-mini-2026-03-17";
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("[ai-insights] OpenAI error:", openaiRes.status, errText);
    return jsonResponse({ error: "Model request failed" }, 502);
  }

  const completion = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = completion.choices?.[0]?.message?.content ?? "{}";

  let parsed: { insights?: InsightItem[]; disclaimer?: string };
  try {
    parsed = JSON.parse(raw) as { insights?: InsightItem[]; disclaimer?: string };
  } catch {
    return jsonResponse({ error: "Invalid model output" }, 502);
  }

  const insightsRaw = Array.isArray(parsed.insights) ? parsed.insights : [];
  const insights: InsightItem[] = insightsRaw
    .filter((i) => i && typeof i.text === "string" && i.text.trim().length > 0)
    .map((i) => ({
      text: i.text.trim(),
      source: typeof i.source === "string" ? i.source : undefined,
      confidence: typeof i.confidence === "string" ? i.confidence : undefined,
      macro_context: typeof i.macro_context === "string" ? i.macro_context : undefined,
    }));

  const disclaimer =
    typeof parsed.disclaimer === "string" && parsed.disclaimer.trim()
      ? parsed.disclaimer.trim()
      : DEFAULT_DISCLAIMER;

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await supabaseAdmin.from("ai_insights_cache").insert({
    deal_scan_id,
    insights,
    model,
    expires_at: expiresAt,
  });

  if (insErr) {
    console.error("[ai-insights] cache insert:", insErr);
    return jsonResponse({ error: "Failed to persist insights" }, 500);
  }

  return jsonResponse({
    supplemental: true,
    insights,
    model,
    disclaimer,
    cached: false,
  });

  } catch (err) {
    console.error("[ai-insights] unhandled:", err);
    return jsonResponse({ error: "Internal error in AI insights function", detail: String(err) }, 500);
  }
});
