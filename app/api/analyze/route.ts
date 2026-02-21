import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";
import { parseSignals } from "@/lib/parseSignals";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserRole,
  ensureProfile,
} from "@/lib/auth";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getUsageToday, incrementAnalyzeUsage } from "@/lib/usage";

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

    // --- Auth check ---
    const supabaseAuth = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn(`[${requestId}] UNAUTHORIZED`, { authError: authError?.message });
      return Response.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
          meta: debug ? { requestId } : undefined,
        },
        { status: 401 }
      );
    }

    try {
      await ensureProfile(supabaseAuth, user);
    } catch (profileErr) {
      console.warn(`[${requestId}] ENSURE_PROFILE_SKIP`, profileErr);
      // Continue; profile may already exist or be created on next request
    }
    const role = await getCurrentUserRole();
    console.log(`[${requestId}] AUTH_OK`, { userId: user.id, email: user.email, role });

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

    // Use service role client for inserts and rate-limit check
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const entitlements = await getEntitlementsForUser(supabase, user.id);
    const usage = await getUsageToday(supabase, user.id);
    if (usage.analyze_calls >= entitlements.analyze_calls_per_day) {
      console.warn(`[${requestId}] DAILY_LIMIT`, {
        userId: user.id,
        used: usage.analyze_calls,
        limit: entitlements.analyze_calls_per_day,
      });
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const upgradeUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/pricing` : "/pricing";
      return Response.json(
        {
          error: "Daily limit reached",
          message: `You've used ${usage.analyze_calls} of ${entitlements.analyze_calls_per_day} analyzes today. Upgrade to Pro for more.`,
          upgrade_url: upgradeUrl,
          meta: debug ? { requestId } : undefined,
        },
        { status: 429 }
      );
    }

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
    const tokensUsed =
      (completion.usage?.prompt_tokens ?? 0) + (completion.usage?.completion_tokens ?? 0) ||
      Math.ceil((output.length + (inputs?.length ?? 0)) / 4);
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
      .insert([{ inputs, output: normalizedOutput, user_id: user.id }])
      .select("id")
      .single();
    console.log(`[${requestId}] RUN_INSERT_DONE`, { ms: Date.now() - tRun });

    if (runErr) {
      console.error(`[${requestId}] RUN_INSERT_FAIL`, runErr);
      return Response.json(
        {
          error: "Supabase runs insert failed.",
          message: runErr?.message ?? "Database error.",
          meta: debug ? { requestId } : undefined,
        },
        { status: 500 }
      );
    }

    if (!runRow?.id) {
      console.error(`[${requestId}] RUN_INSERT_NO_DATA`);
      return Response.json(
        { error: "Server error", message: "Run was not created.", meta: debug ? { requestId } : undefined },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] RUN_INSERT_OK`, { runId: runRow.id });

    try {
      await incrementAnalyzeUsage(supabase, user.id, tokensUsed);
    } catch (usageErr) {
      console.warn(`[${requestId}] USAGE_INCREMENT_SKIP`, usageErr);
    }

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
        user_id: user.id,
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
    const message = err?.message ?? (typeof e === "string" ? e : "Server error");
    console.error(`[${requestId}] SERVER_ERROR`, message, err?.stack);
    return Response.json(
      {
        error: "Server error",
        message: process.env.NODE_ENV === "development" ? message : "Something went wrong. Please try again.",
        meta: debug ? { requestId } : undefined,
      },
      { status: 500 }
    );
  }
}
