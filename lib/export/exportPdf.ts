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
    contributions?: { driver: string; points: number }[];
    top_drivers?: string[];
    tier_drivers?: string[];
    validation_errors?: string[];
    edge_flags?: string[];
    exposure_bucket?: string;
    review_flag?: boolean;
    stale_scan?: boolean;
    previous_score?: number;
    delta_score?: number;
    delta_band?: string;
    deterioration_flag?: boolean;
    driver_confidence_multipliers?: { driver: string; multiplier: number }[];
  } | null;
  /** When macro signals are truncated, show "+N more" (optional). */
  macroSignalsMoreCount?: number;
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

/** Ensure text is safe for pdf-lib StandardFonts (WinAnsi); replace unsupported chars to avoid 500. */
function sanitizeForPdf(s: string | null | undefined): string {
  if (s == null || typeof s !== "string") return "";
  return String(s)
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

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

/** Build attribution line: Score = X, +A driver1, +B driver2, ..., -C stabilizers, Final: X (Band). */
function buildAttributionLine(
  score: number | null,
  band: string | null,
  contributions?: { driver: string; points: number }[]
): string {
  if (score == null || band == null) return "";
  if (!contributions?.length) return `Final: ${score} (${band})`;
  const parts: string[] = [];
  for (const { driver, points } of contributions) {
    if (points > 0) parts.push(`+${Math.round(points)} ${driver}`);
    else if (points < 0) parts.push(`${Math.round(points)} ${driver}`);
  }
  const mid = parts.length ? ` ${parts.join(" ")} ` : " ";
  return `Score = ${score}${mid}Final: ${score} (${band})`;
}

/** Normalize payload so one deal's bad/missing data never throws. */
function normalizeParams(params: ExportPdfParams): ExportPdfParams {
  const str = (v: unknown): string => (v != null && typeof v === "string" ? v : "");
  const arr = <T>(v: unknown, guard: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(guard) : []);
  const assumptionRow = (r: unknown): r is AssumptionRow =>
    r != null && typeof r === "object" && "key" in r;
  const riskRow = (r: unknown): r is RiskRow =>
    r != null && typeof r === "object" && "risk_type" in r;
  const macroRow = (m: unknown): m is MacroSignalRow =>
    m != null && typeof m === "object" && "display_text" in m;
  return {
    dealName: str(params?.dealName) || "Deal",
    assetType: params?.assetType != null && typeof params.assetType === "string" ? params.assetType : null,
    market: params?.market != null && typeof params.market === "string" ? params.market : null,
    riskIndexScore: params?.riskIndexScore != null && typeof params.riskIndexScore === "number" ? params.riskIndexScore : null,
    riskIndexBand: params?.riskIndexBand != null && typeof params.riskIndexBand === "string" ? params.riskIndexBand : null,
    promptVersion: params?.promptVersion != null && typeof params.promptVersion === "string" ? params.promptVersion : null,
    scanTimestamp: str(params?.scanTimestamp) || new Date().toISOString().slice(0, 19).replace("T", " "),
    scanId: str(params?.scanId) || "unknown",
    model: params?.model != null && typeof params.model === "string" ? params.model : null,
    assumptions: arr(params?.assumptions, assumptionRow).map((r) => ({
      key: str((r as AssumptionRow).key),
      value: (r as AssumptionRow).value != null && typeof (r as AssumptionRow).value === "number" ? (r as AssumptionRow).value : null,
      unit: (r as AssumptionRow).unit != null && typeof (r as AssumptionRow).unit === "string" ? (r as AssumptionRow).unit : null,
      confidence: str((r as AssumptionRow).confidence) || "Low",
    })),
    risks: arr(params?.risks, riskRow).map((r) => ({
      risk_type: str((r as RiskRow).risk_type),
      severity_current: str((r as RiskRow).severity_current),
      confidence: (r as RiskRow).confidence != null && typeof (r as RiskRow).confidence === "string" ? (r as RiskRow).confidence : null,
      why_it_matters: (r as RiskRow).why_it_matters != null && typeof (r as RiskRow).why_it_matters === "string" ? (r as RiskRow).why_it_matters : null,
      recommended_action: (r as RiskRow).recommended_action != null && typeof (r as RiskRow).recommended_action === "string" ? (r as RiskRow).recommended_action : null,
    })),
    macroSignals: arr(params?.macroSignals, macroRow).map((m) => ({
      signal_id: str((m as MacroSignalRow).signal_id),
      display_text: str((m as MacroSignalRow).display_text) || "Signal",
    })),
    macroSectionLabel: str(params?.macroSectionLabel) || "Market Signals",
    riskIndexVersion: params?.riskIndexVersion,
    riskBreakdown: params?.riskBreakdown ?? null,
    macroSignalsMoreCount: typeof params?.macroSignalsMoreCount === "number" ? params.macroSignalsMoreCount : undefined,
    recommendedActions: Array.isArray(params?.recommendedActions) ? params.recommendedActions.filter((b): b is string => typeof b === "string") : [],
    icMemoHighlights: params?.icMemoHighlights != null && typeof params.icMemoHighlights === "string" ? params.icMemoHighlights : null,
    scenarioComparison: params?.scenarioComparison ?? null,
  };
}

export async function buildExportPdf(params: ExportPdfParams): Promise<Uint8Array> {
  const p = normalizeParams(params);
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
    const safe = sanitizeForPdf(text);
    const lines = wrapText(safe, contentWidth, size, bold ? fontBold : font);
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
    page.drawText(sanitizeForPdf(title), {
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
  page.drawText(sanitizeForPdf(p.dealName), {
    x: MARGIN,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 22;
  const sub = [p.assetType, p.market].filter(Boolean).join(" · ");
  if (sub) {
    page.drawText(sanitizeForPdf(sub), {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;
  }
  const auditLine = [
    `Scan: ${p.scanTimestamp}`,
    p.model ? `Model: ${p.model}` : null,
    `ID: ${p.scanId.slice(0, 8)}`,
  ].filter(Boolean).join(" · ");
  page.drawText(sanitizeForPdf(auditLine), {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  y -= 14;

  // --- Section 1: CRE Signal Risk Index™ ---
  page.drawText(sanitizeForPdf("CRE Signal Risk Index™"), {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  const versionSuffix = p.riskIndexVersion ? ` · Scoring v${p.riskIndexVersion}` : "";
  const scoreText =
    p.riskIndexScore != null && p.riskIndexBand
      ? `Score: ${p.riskIndexScore} — ${p.riskIndexBand}${versionSuffix}`
      : "—";
  page.drawText(sanitizeForPdf(scoreText), {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  const interpretation = riskIndexInterpretation(p.riskIndexScore, p.riskIndexBand);
  if (interpretation && !drawLine(interpretation, 9, false, rgb(0.25, 0.25, 0.25))) {
    // skip if no space
  }
  y -= 10;

  const breakdownLine = p.riskBreakdown ? buildBreakdownLine(p.riskBreakdown, p.riskIndexVersion) : "";
  if (breakdownLine && drawLine(breakdownLine, 8, false, rgb(0.3, 0.3, 0.3))) {
    y -= 8;
  }
  const attributionLine = p.riskBreakdown?.contributions?.length
    ? buildAttributionLine(p.riskIndexScore, p.riskIndexBand, p.riskBreakdown.contributions)
    : "";
  if (attributionLine && drawLine(attributionLine, 8, false, rgb(0.3, 0.3, 0.3))) {
    y -= 8;
  }
  if (p.riskBreakdown?.top_drivers?.length && drawLine(`Top 3 Risk Drivers: ${p.riskBreakdown.top_drivers.join(", ")}`, 7, false, rgb(0.35, 0.35, 0.35))) {
    y -= 6;
  }
  if (p.riskBreakdown?.tier_drivers?.length && drawLine(`Tier Drivers: [${p.riskBreakdown.tier_drivers.join(", ")}]`, 7, false, rgb(0.35, 0.35, 0.35))) {
    y -= 6;
  }

  // --- Section 2: Deal Snapshot (Key Assumptions) ---
  if (p.assumptions.length > 0 && drawSectionTitle("Deal Snapshot")) {
    for (const row of p.assumptions) {
      if (!drawLine(formatAssumption(row), 9, false, rgb(0.25, 0.25, 0.25))) break;
    }
    y -= 8;
  }

  // --- Section 3: Primary Risks (top 3) ---
  if (p.risks.length > 0 && drawSectionTitle("Primary Risks")) {
    for (const r of p.risks) {
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

  // --- Section 4: Linked Macro Signals (deduped; max 3 per risk; "+N more" when truncated) ---
  if (drawSectionTitle(p.macroSectionLabel)) {
    if (p.macroSignals.length > 0) {
      for (const m of p.macroSignals) {
        if (!drawLine(m.display_text, 8, false, rgb(0.3, 0.3, 0.3))) break;
      }
      if (typeof p.macroSignalsMoreCount === "number" && p.macroSignalsMoreCount > 0) {
        drawLine(`+${p.macroSignalsMoreCount} more signals`, 7, false, rgb(0.4, 0.4, 0.4));
      }
    } else {
      drawLine(NO_MACRO_SIGNALS_MESSAGE, 8, false, rgb(0.4, 0.4, 0.4));
    }
    y -= 8;
  }

  // --- Section 5: Recommended Actions ---
  const recommendedActions = p.recommendedActions?.length ? p.recommendedActions : [];
  if (recommendedActions.length > 0 && drawSectionTitle("Recommended Actions")) {
    for (const bullet of recommendedActions) {
      if (!drawLine(`• ${oneSentence(bullet)}`, 8, false, rgb(0.3, 0.3, 0.3))) break;
    }
    y -= 8;
  }

  // --- Scenario comparison (optional: base vs conservative) ---
  const scenario = p.scenarioComparison;
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
  const icMemo = p.icMemoHighlights != null && typeof p.icMemoHighlights === "string" ? p.icMemoHighlights.trim() : "";
  if (icMemo.length > 0 && drawSectionTitle("IC Memo Highlights")) {
    const rawLines = icMemo.split(/\n/).map((l) => (typeof l === "string" ? l : "").trim()).filter(Boolean);
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
    `Scan: ${p.scanTimestamp}`,
    `ID: ${p.scanId}`,
    p.model ? `Model: ${p.model}` : null,
    p.promptVersion ? `Prompt: ${p.promptVersion}` : null,
    p.riskIndexVersion ? `Scoring v${p.riskIndexVersion}` : null,
  ].filter(Boolean);
  page.drawText(sanitizeForPdf(auditParts.join(" · ")), {
    x: MARGIN,
    y: MARGIN + 50,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
    maxWidth: contentWidth,
  });
  page.drawText(sanitizeForPdf(DISCLAIMER), {
    x: MARGIN,
    y: MARGIN + 32,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
    maxWidth: contentWidth,
  });

  return doc.save();
}

/** Word-wrap using font width. Safe for empty or problematic strings. */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number }
): string[] {
  const safe = typeof text === "string" ? text : "";
  if (!safe) return [];
  try {
    if (font.widthOfTextAtSize(safe, fontSize) <= maxWidth) return [safe];
  } catch {
    return [safe.slice(0, 80)];
  }
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    try {
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
        if (line) {
          while (line.length > 50) {
            const chunk = line.slice(0, 50);
            lines.push(chunk);
            line = line.slice(50);
          }
        }
      }
    } catch {
      if (line) lines.push(line);
      lines.push(word.slice(0, 80));
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines;
}
