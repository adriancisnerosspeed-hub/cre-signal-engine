import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";

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
    const { error: insertError } = await supabase
      .from("runs")
      .insert([{ inputs, output }]);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
    } else {
      console.log("Supabase insert success");
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
