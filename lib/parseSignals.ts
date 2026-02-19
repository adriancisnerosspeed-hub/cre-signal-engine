type ParsedSignal = {
  idx: number;              // 1..N
  is_actionable: boolean;
  signal_type: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  action: string | null;    // Act/Monitor/Ignore or null
  confidence: string | null; // Low/Medium/High or null
  raw_text: string;         // full block text for audit
};

function grabField(block: string, label: string) {
  // Matches: "Label: ... (until next labeled line or end)"
  const re = new RegExp(
    `${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(Signal Type|What Changed|Why It Matters|Who This Affects|Action|Confidence)\\s*:|$)`,
    "i"
  );
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

export function parseSignals(output: string): ParsedSignal[] {
  const text = (output || "").trim();
  if (!text) return [];

  // Split by numbered headers like "1)"
  const parts = text.split(/\n(?=\s*\d+\)\s*)/g);

  const results: ParsedSignal[] = [];

  for (const part of parts) {
    const m = part.match(/^\s*(\d+)\)\s*([\s\S]*)$/);
    if (!m) continue;

    const idx = Number(m[1]);
    const blockBody = (m[2] || "").trim();
    const raw_text = `${idx})\n${blockBody}`.trim();

    // Handle "No actionable signal."
    if (/^No actionable signal\.\s*$/i.test(blockBody)) {
      results.push({
        idx,
        is_actionable: false,
        signal_type: null,
        what_changed: null,
        why_it_matters: null,
        who_this_affects: null,
        action: null,
        confidence: null,
        raw_text,
      });
      continue;
    }

    // Schema fields
    const signal_type = grabField(blockBody, "Signal Type");
    const what_changed = grabField(blockBody, "What Changed");
    const why_it_matters = grabField(blockBody, "Why It Matters");
    const who_this_affects = grabField(blockBody, "Who This Affects");
    const action = grabField(blockBody, "Action");
    const confidence = grabField(blockBody, "Confidence");

    const is_actionable =
      action ? /^(Act|Monitor|Ignore)$/i.test(action.trim()) : false;

    results.push({
      idx,
      is_actionable,
      signal_type: signal_type || null,
      what_changed: what_changed || null,
      why_it_matters: why_it_matters || null,
      who_this_affects: who_this_affects || null,
      action: action ? action.trim() : null,
      confidence: confidence ? confidence.trim() : null,
      raw_text,
    });
  }

  // Sort by idx to be safe
  results.sort((a, b) => a.idx - b.idx);
  return results;
}
