import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";
import { parseSignals } from "@/lib/parseSignals";

export const runtime = "nodejs";

function safePreview(s: string, n = 220) {
  return (s ?? "").slice(0, n).replace(/\s+/g, " ").trim();
}

function pickSupabaseErrorFields(err: unknown): {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} {
  if (!err || typeof err !== "object") return {};
  const e = err as Record<string, unknown>;
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    details: typeof e.details === "string" ? e.details : undefined,
    hint: typeof e.hint === "string" ? e.hint : undefined,
  };
}

function normalizeModelOutputToContract(raw: string): string {
  const allowedTypes = new Set([
    "Pricing",
    "Credit Availability",
    "Credit Risk",
    "Liquidity",
    "Supply-Demand",
    "Policy",
    "Deal-Specific",
  ]);

  const blocks = raw.split(/\n(?=\d+\))/g);

  const fixedBlocks = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return trimmed;

    // If the block contains "Action: No actionable signal." treat as non-actionable.
    if (/Action:\s*No actionable signal\./i.test(trimmed)) {
      const m = trimmed.match(/^(\d+\))/);
      return m ? `${m[1]}\nNo actionable signal.` : `No actionable signal.`;
    }

    // If it already is "No actionable signal." keep it.
    if (/^(\d+\)\s*)?No actionable signal\.\s*$/i.test(trimmed)) {
      const m = trimmed.match(/^(\d+\))/);
      return m ? `${m[1]}\nNo actionable signal.` : `No actionable signal.`;
    }

    // Normalize Signal Type line
    const typeMatch = trimmed.match(/Signal Type:\s*(.+)/i);
    if (typeMatch) {
      const rawType = typeMatch[1].trim();

      // pick first valid type if multiple separated by /
      const candidates = rawType.split("/").map((s) => s.trim());
      let chosen = candidates.find((t) => allowedTypes.has(t));

      // Map common non-allowed to allowed
      if (!chosen) {
        if (/operating expense|insurance/i.test(rawType)) chosen = "Pricing";
        else chosen = "Deal-Specific";
      }

      return trimmed.replace(/Signal Type:\s*(.+)/i, `Signal Type: ${chosen}`);
    }

    return trimmed;
  });

  return fixedBlocks.join("\n\n").trim();
}

export async function POST(req: Request) {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const started = Date.now();
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  console.log(`[${requestId}] REQ`, { method: req.method, url: req.url });


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
    const normalizedOutput = normalizeModelOutputToContract(output);

    if (debug) {
      console.log(`[${requestId}] MODEL_OUTPUT_RAW`, {
        len: output.length,
        preview: safePreview(output),
      });
      console.log(`[${requestId}] MODEL_OUTPUT_NORMALIZED`, {
        len: normalizedOutput.length,
        preview: safePreview(normalizedOutput),
        changed: output.trim() !== normalizedOutput.trim(),
      });
    } else {
      console.log(`[${requestId}] MODEL_OUTPUT_NORMALIZED`, {
        len: normalizedOutput.length,
        preview: safePreview(normalizedOutput),
      });
    }

    // --- Insert run ---
    const tRun = Date.now();
    const { data: runRow, error: runErr } = await supabase
      .from("runs")
      .insert([{ inputs, output: normalizedOutput }])
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
    const parsed = parseSignals(normalizedOutput);

    const parseStats = {
      parsed: parsed.length,
      actionable: parsed.filter((s) => s.is_actionable).length,
      nonActionable: parsed.filter((s) => !s.is_actionable).length,
    };
    console.log(`[${requestId}] PARSE_COUNTS`, parseStats);

    // Only store actionable signals with required fields present
    const actionable = parsed.filter((s) => s.is_actionable);
    const validAction = new Set(["Act", "Monitor", "Ignore"]);
    const rows = actionable
      .map((s) => ({
        run_id: runRow.id,
        idx: s.idx,
        is_actionable: true,
        signal_type: (s.signal_type ?? "").trim(),
        what_changed: s.what_changed ?? "",
        why_it_matters: s.why_it_matters ?? "",
        who_this_affects: s.who_this_affects ?? "",
        action: (s.action ?? "").trim(),
        confidence: (s.confidence ?? "").trim(),
        raw_text: s.raw_text ?? "",
      }))
      .filter((r) => {
        if (!Number.isFinite(r.idx) || r.idx <= 0) return false;
        if (!r.signal_type) return false;
        if (!r.action || !validAction.has(r.action)) return false;
        return true;
      });

    const droppedForMissingRequired = actionable.length - rows.length;
    if (debug) {
      console.log(`[${requestId}] SIGNAL_ROWS_PREPARED`, {
        actionable: actionable.length,
        insertable: rows.length,
        droppedForMissingRequired,
      });
    }

    let signalsInserted = 0;
    let signalsInsertError:
      | { message?: string; code?: string; details?: string; hint?: string }
      | null = null;

    if (rows.length > 0) {
      console.log(`[${requestId}] SIGNALS_INSERT_ATTEMPT`, { rows: rows.length });
      const { error: sigErr } = await supabase.from("signals").insert(rows);

      if (sigErr) {
        signalsInsertError = pickSupabaseErrorFields(sigErr);
        console.error(
          `[${requestId}] SIGNALS_INSERT_FAIL`,
          JSON.stringify(signalsInsertError, null, 2)
        );
      } else {
        signalsInserted = rows.length;
        console.log(`[${requestId}] SIGNALS_INSERT_OK`, { signalsInserted });
      }
    } else {
      console.log(`[${requestId}] SIGNALS_INSERT_SKIP`, {
        reason: actionable.length === 0 ? "no actionable signals" : "no valid rows",
        actionable: actionable.length,
        droppedForMissingRequired,
      });
    }

    const ms = Date.now() - started;
    console.log(`[${requestId}] DONE`, { ms, runId: runRow.id, signalsInserted });

    return Response.json({
      output: normalizedOutput,
      meta: debug
        ? {
            requestId,
            runId: runRow.id,
            signalsInserted,
            ms,
            parse: parseStats,
            ...(signalsInsertError ? { signalsInsertError } : {}),
          }
        : undefined,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : null;
    console.error(
      `[${requestId}] SERVER_ERROR`,
      err?.message ?? e,
      err?.stack
    );
    return Response.json(
      {
        error: "Server error",
        detail: err?.message ?? String(e),
        meta: debug ? { requestId } : undefined,
      },
      { status: 500 }
    );
  }
}
