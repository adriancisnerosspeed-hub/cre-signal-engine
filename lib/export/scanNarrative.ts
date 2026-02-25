/**
 * Rendering layer for IC Memorandum Narrative export.
 * Plain text now; structure allows adding PDF later without refactor.
 */

export function formatNarrativeAsText(params: {
  narrative: string;
  dealName?: string | null;
  scanCreatedAt?: string | null;
  riskIndexScore?: number | null;
  riskIndexBand?: string | null;
}): string {
  const { narrative, dealName, scanCreatedAt, riskIndexScore, riskIndexBand } = params;
  const lines: string[] = [];
  lines.push("CRE SIGNAL ENGINE — IC MEMORANDUM NARRATIVE");
  lines.push("");
  if (dealName) lines.push(`Deal: ${dealName}`);
  if (scanCreatedAt) lines.push(`Scan date: ${new Date(scanCreatedAt).toISOString().slice(0, 10)}`);
  if (riskIndexScore != null && riskIndexBand) {
    lines.push(`CRE Signal Risk Index™: ${riskIndexScore} — ${riskIndexBand}`);
  }
  lines.push("");
  lines.push("—");
  lines.push("");
  lines.push(narrative);
  lines.push("");
  lines.push("—");
  lines.push("CRE Signal Risk Index™ is an underwriting support tool. Final investment decisions should incorporate sponsor diligence and third-party validation.");
  return lines.join("\n");
}
