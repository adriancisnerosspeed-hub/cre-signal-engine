/**
 * One-page IC PDF export. No model provider or AI branding.
 * Hard limit: 1 page; overflow truncates lower-priority sections.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  oneSentence,
  diligenceAction,
  normalizeTextForDedupe,
  type AssumptionRow,
  type RiskRow,
  type MacroSignalRow,
} from "./pdfSelectors";

const DISCLAIMER =
  "CRE Signal Risk Index™ is an underwriting support tool. Final investment decisions should incorporate sponsor diligence and third-party validation.";

const NO_MACRO_SIGNALS_MESSAGE =
  "No relevant macro signals available for this risk in this market yet.";

function riskIndexInterpretation(score: number | null, band: string | null): string {
  if (score == null || !band) return "";
  switch (band) {
    case "Low":
      return "Risk profile is within typical underwriting tolerance; proceed with standard diligence.";
    case "Moderate":
      return "Elevated risk factors warrant targeted stress testing and macro alignment checks.";
    case "Elevated":
      return "Material risk factors require explicit mitigation or pricing adjustment before commitment.";
    case "High":
      return "Significant risk concentration; recommend enhanced diligence and/or revised terms.";
    default:
      return "";
  }
}

export type ExportPdfParams = {
  dealName: string;
  assetType: string | null;
  market: string | null;
  riskIndexScore: number | null;
  riskIndexBand: string | null;
  promptVersion: string | null;
  scanTimestamp: string;
  scanId: string;
  model: string | null;
  /** Top assumptions (IC order), use "—" if missing */
  assumptions: AssumptionRow[];
  /** Top 3 risks with why_it_matters and recommended_action */
  risks: RiskRow[];
  /** Deduped macro signals, max 5; empty shows fallback message */
  macroSignals: MacroSignalRow[];
  macroSectionLabel: string;
  /** Scoring logic version (e.g. "1.2") for defensibility */
  riskIndexVersion?: string | null;
  /** Risk Index breakdown for PDF section */
  riskBreakdown?: {
    structural_weight?: number;
    market_weight?: number;
    confidence_factor?: number;
    stabilizer_benefit?: number;
    penalty_total?: number;
  } | null;
  /** 2–4 actionable bullets */
  recommendedActions?: string[];
  /** Abbreviated IC memo narrative (max ~1200 chars) or null; deduped before render */
  icMemoHighlights?: string | null;
  /** Optional: base vs conservative key assumptions for scenario comparison */
  scenarioComparison?: {
    base: Record<string, number | null>;
    conservative: Record<string, number | null>;
  } | null;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const FOOTER_BLOCK_HEIGHT = 72; // space for audit line + disclaimer
const MIN_Y = MARGIN + FOOTER_BLOCK_HEIGHT;

function formatAssumption(row: AssumptionRow): string {
  const val = row.value != null ? String(row.value) : "—";
  const unit = row.unit ? ` ${row.unit}` : "";
  return `${row.key}: ${val}${unit} (${row.confidence})`;
}

function buildBreakdownLine(
  b: { structural_weight?: number; market_weight?: number; confidence_factor?: number; stabilizer_benefit?: number; penalty_total?: number },
  version?: string | null
): string {
  const parts: string[] = [];
  if (b.structural_weight != null) parts.push(`Structural ${b.structural_weight}%`);
  if (b.market_weight != null) parts.push(`Market ${b.market_weight}%`);
  if (b.confidence_factor != null) parts.push(`Confidence ${b.confidence_factor}`);
  if (b.stabilizer_benefit != null) parts.push(`Stabilizers -${b.stabilizer_benefit}`);
  if (b.penalty_total != null) parts.push(`Penalties +${b.penalty_total}`);
  if (version) parts.push(`Scoring v${version}`);
  return parts.length ? parts.join(" | ") : "";
}

export async function buildExportPdf(params: ExportPdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const lineHeight = (size: number) => size * 1.25;
  const drawLine = (
    text: string,
    size: number,
    bold: boolean,
    color = rgb(0, 0, 0)
  ): boolean => {
    if (y < MIN_Y) return false;
    const lines = wrapText(text, contentWidth, size, bold ? fontBold : font);
    for (const line of lines) {
      if (y < MIN_Y) return false;
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: bold ? fontBold : font,
        color,
        maxWidth: contentWidth,
      });
      y -= lineHeight(size);
    }
    return true;
  };

  const drawSectionTitle = (title: string): boolean => {
    if (y < MIN_Y) return false;
    page.drawText(title, {
      x: MARGIN,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight(11) + 4;
    return true;
  };

  // --- Header: Deal Name, Asset Type, City/State; Scan timestamp, model, scan id ---
  page.drawText(params.dealName, {
    x: MARGIN,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 22;
  const sub = [params.assetType, params.market].filter(Boolean).join(" · ");
  if (sub) {
    page.drawText(sub, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;
  }
  const auditLine = [
    `Scan: ${params.scanTimestamp}`,
    params.model ? `Model: ${params.model}` : null,
    `ID: ${params.scanId.slice(0, 8)}`,
  ].filter(Boolean).join(" · ");
  page.drawText(auditLine, {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  y -= 14;

  // --- Section 1: CRE Signal Risk Index™ ---
  page.drawText("CRE Signal Risk Index™", {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  const versionSuffix = params.riskIndexVersion ? ` · Scoring v${params.riskIndexVersion}` : "";
  const scoreText =
    params.riskIndexScore != null && params.riskIndexBand
      ? `Score: ${params.riskIndexScore} — ${params.riskIndexBand}${versionSuffix}`
      : "—";
  page.drawText(scoreText, {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  const interpretation = riskIndexInterpretation(params.riskIndexScore, params.riskIndexBand);
  if (interpretation && !drawLine(interpretation, 9, false, rgb(0.25, 0.25, 0.25))) {
    // skip if no space
  }
  y -= 10;

  const breakdownLine = params.riskBreakdown ? buildBreakdownLine(params.riskBreakdown, params.riskIndexVersion) : "";
  if (breakdownLine && drawLine(breakdownLine, 8, false, rgb(0.3, 0.3, 0.3))) {
    y -= 8;
  }

  // --- Section 2: Deal Snapshot (Key Assumptions) ---
  if (params.assumptions.length > 0 && drawSectionTitle("Deal Snapshot")) {
    for (const row of params.assumptions) {
      if (!drawLine(formatAssumption(row), 9, false, rgb(0.25, 0.25, 0.25))) break;
    }
    y -= 8;
  }

  // --- Section 3: Primary Risks (top 3) ---
  if (params.risks.length > 0 && drawSectionTitle("Primary Risks")) {
    for (const r of params.risks) {
      if (y < MIN_Y) break;
      const titleLine = `${r.risk_type} — ${r.severity_current}${r.confidence ? ` / ${r.confidence}` : ""}`;
      if (!drawLine(titleLine, 9, true)) break;
      const why = oneSentence(r.why_it_matters);
      if (why && !drawLine(why, 8, false, rgb(0.3, 0.3, 0.3))) break;
      const action = diligenceAction(r.recommended_action);
      if (!drawLine(action, 8, false, rgb(0.35, 0.35, 0.35))) break;
      y -= 4;
    }
    y -= 8;
  }

  // --- Section 4: Linked Macro Signals (deduped; fallback if none) ---
  if (drawSectionTitle(params.macroSectionLabel)) {
    if (params.macroSignals.length > 0) {
      for (const m of params.macroSignals) {
        if (!drawLine(m.display_text, 8, false, rgb(0.3, 0.3, 0.3))) break;
      }
    } else {
      drawLine(NO_MACRO_SIGNALS_MESSAGE, 8, false, rgb(0.4, 0.4, 0.4));
    }
    y -= 8;
  }

  // --- Section 5: Recommended Actions ---
  const recommendedActions = params.recommendedActions?.length ? params.recommendedActions : [];
  if (recommendedActions.length > 0 && drawSectionTitle("Recommended Actions")) {
    for (const bullet of recommendedActions) {
      if (!drawLine(`• ${oneSentence(bullet)}`, 8, false, rgb(0.3, 0.3, 0.3))) break;
    }
    y -= 8;
  }

  // --- Scenario comparison (optional: base vs conservative) ---
  const scenario = params.scenarioComparison;
  if (scenario && drawSectionTitle("Scenario Comparison")) {
    const keys = ["vacancy", "exit_cap", "rent_growth", "debt_rate"] as const;
    for (const k of keys) {
      const b = scenario.base[k] ?? scenario.base[k as string];
      const c = scenario.conservative[k] ?? scenario.conservative[k as string];
      if (b != null || c != null) {
        const delta = typeof b === "number" && typeof c === "number" ? c - b : null;
        const line = `${k}: Base ${b ?? "—"} | Conservative ${c ?? "—"}${delta != null ? ` (delta ${delta >= 0 ? "+" : ""}${delta})` : ""}`;
        if (!drawLine(line, 8, false, rgb(0.3, 0.3, 0.3))) break;
      }
    }
    y -= 6;
  }

  // --- Section 6: IC Memorandum Narrative (optional); dedupe identical lines ---
  if (params.icMemoHighlights && params.icMemoHighlights.trim().length > 0 && drawSectionTitle("IC Memo Highlights")) {
    const rawLines = params.icMemoHighlights.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const line of rawLines) {
      const key = normalizeTextForDedupe(line);
      if (key && !seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
    }
    for (const line of lines.slice(0, 8)) {
      if (!drawLine(line.slice(0, 90), 8, false, rgb(0.3, 0.3, 0.3))) break;
    }
  }

  // --- Footer (fixed at bottom) ---
  const auditParts = [
    `Scan: ${params.scanTimestamp}`,
    `ID: ${params.scanId}`,
    params.model ? `Model: ${params.model}` : null,
    params.promptVersion ? `Prompt: ${params.promptVersion}` : null,
    params.riskIndexVersion ? `Scoring v${params.riskIndexVersion}` : null,
  ].filter(Boolean);
  page.drawText(auditParts.join(" · "), {
    x: MARGIN,
    y: MARGIN + 50,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
    maxWidth: contentWidth,
  });
  page.drawText(DISCLAIMER, {
    x: MARGIN,
    y: MARGIN + 32,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
    maxWidth: contentWidth,
  });

  return doc.save();
}

/** Word-wrap using font width. */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number }
): string[] {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
