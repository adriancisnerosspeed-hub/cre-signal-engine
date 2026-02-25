/**
 * IC Memorandum Narrative — institutional memo prompt.
 * 300–400 words, references CRE Signal Risk Index™, no hallucinated numbers.
 */

export const IC_MEMO_SYSTEM_PROMPT = `You are writing an internal Investment Committee memo for a mid-market PE real estate firm. Your tone is institutional, concise, and analytical. No hype, no marketing language, no emojis.

RULES:
- Use only the data provided. Do not invent numbers or assumptions.
- Where data is missing, state "Data not provided" explicitly.
- Do not overstate conclusions. No dramatic language.
- Output must be 300–400 words.
- Structure your response with these section headers exactly: Executive Summary | Investment Thesis | Key Assumptions | Primary Risks | Market Context | Recommendation.
- Recommendation must be exactly one of: Proceed | Proceed with Conditions | Re-underwrite.
- You must reference the CRE Signal Risk Index™ (score and band) in the Executive Summary.`;

export const IC_MEMO_PROMPT_VERSION = "1.0";

export function buildIcMemoUserPrompt(params: {
  assumptions: Record<string, { value?: number | null; unit?: string | null; confidence?: string }>;
  risks: { risk_type: string; severity_current: string; what_changed_or_trigger?: string | null; why_it_matters?: string | null; who_this_affects?: string | null }[];
  riskIndexScore: number | null;
  riskIndexBand: string | null;
  dealName?: string | null;
}): string {
  const { assumptions, risks, riskIndexScore, riskIndexBand, dealName } = params;
  const assumptionLines = Object.entries(assumptions || {}).map(
    ([k, v]) => `  ${k}: ${v.value != null ? v.value : "Data not provided"}${v.unit ? ` ${v.unit}` : ""} (confidence: ${v.confidence ?? "—"})`
  );
  const riskLines = risks.map(
    (r) =>
      `  - ${r.risk_type} (${r.severity_current}): ${r.what_changed_or_trigger ?? ""} ${r.why_it_matters ?? ""} Affects: ${r.who_this_affects ?? "—"}`
  );
  return `Write an IC Memorandum Narrative for this deal scan.

Deal: ${dealName ?? "Unnamed"}

CRE Signal Risk Index™: ${riskIndexScore != null ? riskIndexScore : "Data not provided"} — ${riskIndexBand ?? "Data not provided"}

Key assumptions (use only these; if missing say "Data not provided"):
${assumptionLines.length ? assumptionLines.join("\n") : "  (none provided)"}

Primary risks:
${riskLines.length ? riskLines.join("\n") : "  (none identified)"}

Write the memo using the required section headers. Reference the CRE Signal Risk Index™ in the Executive Summary. Keep total length to 300–400 words.`;
}
