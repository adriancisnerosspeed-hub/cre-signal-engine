import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";
import { parseSignals } from "@/lib/parseSignals";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    console.log("ENV OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY);
    console.log("ENV SUPABASE_URL:", !!process.env.SUPABASE_URL);
    console.log("ENV SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: "Missing environment variables." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { inputs } = await req.json();

    if (!inputs || typeof inputs !== "string") {
      return Response.json(
        { error: "Expected JSON body: { inputs: string }" },
        { status: 400 }
      );
    }

    // 🔹 OpenAI call
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: CRE_SIGNAL_PROMPT },
        { role: "user", content: inputs },
      ],
    });

    const output = completion.choices?.[0]?.message?.content ?? "";

    // 🔹 Insert into Supabase
    const { data: runRow, error: runInsertError } = await supabase
  .from("runs")
  .insert([{ inputs, output }])
  .select("id")
  .single();

if (runInsertError) {
  console.error("Supabase runs insert error:", runInsertError);
} else {
  console.log("Supabase runs insert success:", runRow?.id);
}

if (runRow?.id) {
  const parsed = parseSignals(output);
  console.log("OUTPUT preview:", output.slice(0, 180));
  console.log("Parsed signals count:", parsed.length);
  if (parsed.length) console.log("First parsed row:", parsed[0]);

  const rows = parsed.map((s) => ({
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

  console.log("Attempting signals insert rows:", rows.length);
  
  const { error: sigErr } = await supabase.from("signals").insert(rows);

  if (sigErr) {
  console.error("Supabase signals insert error:", JSON.stringify(sigErr, null, 2));
  } else {
    console.log("Supabase signals insert success:", rows.length);
  }
}

    return Response.json({ output });

  } catch (e: any) {
    console.error("SERVER ERROR:", e);
    return Response.json(
      { error: "Server error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
