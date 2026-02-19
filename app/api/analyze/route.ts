import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";
import { parseSignals } from "@/lib/parseSignals";

export const runtime = "nodejs";

function safePreview(s: string, n = 220) {
  return (s ?? "").slice(0, n).replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const started = Date.now();
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  try {
    console.log(`[${requestId}] HIT /api/analyze`, {
      debug,
      nodeEnv: process.env.NODE_ENV,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseKey) {
      console.error(`[${requestId}] MISSING_ENV`);
      return Response.json(
        {
          error: "Missing environment variables on server.",
          meta: debug
            ? {
                requestId,
                hasOpenAI: !!apiKey,
                hasSupabaseUrl: !!supabaseUrl,
                hasServiceRole: !!supabaseKey,
              }
            : undefined,
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => null);
    const inputs = body?.inputs;

    if (!inputs || typeof inputs !== "string") {
      console.warn(`[${requestId}] BAD_INPUT`, { bodyType: typeof body });
      return Response.json(
        {
          error: "Expected JSON body: { inputs: string }",
          meta: debug ? { requestId } : undefined,
        },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] INPUT`, {
      len: inputs.length,
      preview: safePreview(inputs),
    });

    const client = new OpenAI({ apiKey });

    // --- OpenAI ---
    const tOpenAI = Date.now();
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: CRE_SIGNAL_PROMPT },
        { role: "user", content: inputs },
      ],
    });
    console.log(`[${requestId}] OPENAI_OK`, { ms: Date.now() - tOpenAI });

    const output = completion.choices?.[0]?.message?.content ?? "";

    console.log(`[${requestId}] MODEL_OUTPUT`, {
      len: output.length,
      preview: safePreview(output),
    });

    // --- Insert run ---
    const tRun = Date.now();
    const { data: runRow, error: runErr } = await supabase
      .from("runs")
      .insert([{ inputs, output }])
      .select("id")
      .single();
    console.log(`[${requestId}] RUN_INSERT_DONE`, { ms: Date.now() - tRun });

    if (runErr) {
      console.error(`[${requestId}] RUN_INSERT_FAIL`, runErr);
      return Response.json(
        {
          error: "Supabase runs insert failed.",
          detail: runErr,
          meta: debug ? { requestId } : undefined,
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] RUN_INSERT_OK`, { runId: runRow.id });

    // --- Parse + insert signals ---
    const parsed = parseSignals(output);

    console.log(`[${requestId}] PARSE`, {
      count: parsed.length,
      first: parsed[0]
        ? {
            idx: parsed[0].idx,
            is_actionable: parsed[0].is_actionable,
            signal_type: parsed[0].signal_type,
            action: parsed[0].action,
            confidence: parsed[0].confidence,
            raw_preview: safePreview(parsed[0].raw_text ?? ""),
          }
        : null,
    });

    // ✅ FIX: only insert actionable signals (prevents NOT NULL constraint errors)
    const actionable = parsed.filter(
      (s) =>
        s.is_actionable === true &&
        !!s.signal_type &&
        !!s.what_changed &&
        !!s.why_it_matters &&
        !!s.who_this_affects &&
        !!s.action &&
        !!s.confidence
    );

    console.log(`[${requestId}] ACTIONABLE_FILTER`, {
      actionableCount: actionable.length,
      skippedCount: parsed.length - actionable.length,
    });

    let signalsInserted = 0;

    if (actionable.length > 0) {
      const rows = actionable.map((s) => ({
        run_id: runRow.id,
        idx: s.idx,
        is_actionable: s.is_actionable,
        signal_type: s.signal_type,
        what_changed: s.what_changed,
        why_it_matters: s.why_it_matters,
        who_this_affects: s.who_this_affects,
        action: s.action,
        confidence: s.confidence,
        raw_text: s.raw_text,
      }));

      console.log(`[${requestId}] SIGNALS_INSERT_ATTEMPT`, {
        rows: rows.length,
        sample: rows[0]
          ? {
              idx: rows[0].idx,
              signal_type: rows[0].signal_type,
              action: rows[0].action,
              confidence: rows[0].confidence,
            }
          : null,
      });

      const tSig = Date.now();
      const { error: sigErr } = await supabase.from("signals").insert(rows);
      console.log(`[${requestId}] SIGNALS_INSERT_DONE`, { ms: Date.now() - tSig });

      if (sigErr) {
        console.error(
          `[${requestId}] SIGNALS_INSERT_FAIL`,
          JSON.stringify(sigErr, null, 2)
        );
      } else {
        signalsInserted = rows.length;
        console.log(`[${requestId}] SIGNALS_INSERT_OK`, { count: signalsInserted });
      }
    } else {
      console.log(`[${requestId}] NO_ACTIONABLE_SIGNALS — skipping signals insert`);
    }

    const ms = Date.now() - started;
    console.log(`[${requestId}] DONE`, { ms, runId: runRow.id, signalsInserted });

    return Response.json({
      output,
      meta: debug ? { requestId, runId: runRow.id, signalsInserted, ms } : undefined,
    });
  } catch (e: any) {
    console.error(`[${requestId}] SERVER_ERROR`, e?.message ?? e, e?.stack);
    return Response.json(
      {
        error: "Server error",
        detail: e?.message ?? String(e),
        meta: debug ? { requestId } : undefined,
      },
      { status: 500 }
    );
  }
}
