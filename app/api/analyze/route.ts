import OpenAI from "openai";
import { CRE_SIGNAL_PROMPT } from "@/lib/prompts/creSignalPrompt";

export const runtime = "nodejs";

function looksValid(output: string, expectedCount: number) {
  for (let i = 1; i <= expectedCount; i++) {
    if (!output.includes(`${i})`)) return false;
  }
  return true;
}

function estimateExpectedCount(inputs: string) {
  // Prefer numbered blocks: 1) ... 2) ... etc.
  const numbered = inputs.match(/(^|\n)\s*\d+\)\s*/g)?.length ?? 0;
  if (numbered > 0) return numbered;

  // Fallback: split by blank lines (double newline)
  const blocks = inputs.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return Math.max(1, blocks.length);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY. Check .env.local and restart dev server." },
        { status: 500 }
      );
    }

    const { inputs } = await req.json();
    if (!inputs || typeof inputs !== "string") {
      return Response.json(
        { error: "Expected JSON body: { inputs: string }" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    const expectedCount = estimateExpectedCount(inputs);

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: CRE_SIGNAL_PROMPT },
        { role: "user", content: inputs },
      ],
    });

    let output = completion.choices?.[0]?.message?.content ?? "";

    // Retry once if formatting is broken
    if (!looksValid(output, expectedCount)) {
      const retry = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: CRE_SIGNAL_PROMPT },
          {
            role: "user",
            content:
              "FORMAT FIX: Output exactly one result per input labeled 1) through N). " +
              "Each result must be either exactly 'No actionable signal.' or the full schema.\n\n" +
              inputs,
          },
        ],
      });

      output = retry.choices?.[0]?.message?.content ?? output;
    }

    return Response.json({ output });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const detail = e?.error?.message ?? e?.message ?? String(e);
    return Response.json({ error: "Server error", detail }, { status });
  }
}
