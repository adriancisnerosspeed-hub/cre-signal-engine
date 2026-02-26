/**
 * One-page IC PDF export. No model provider or AI branding.
 * Hard limit: 1 page; overflow truncates lower-priority sections.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  oneSentence,
  diligenceAction,
  type AssumptionRow,
  type RiskRow,
  type MacroSignalRow,
} from "./pdfSelectors";

const DISCLAIMER =
  "CRE Signal Risk Index™ is an underwriting support tool. Final investment decisions should incorporate sponsor diligence and third-party validation.";

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
  /** Top N assumptions (e.g. 6), already selected */
  assumptions: AssumptionRow[];
  /** Top N risks (e.g. 3), with why_it_matters and recommended_action */
  risks: RiskRow[];
  /** Deduped macro signals, max 5, single section */
  macroSignals: MacroSignalRow[];
  /** "Macro Signals (Deduped)" or "General Macro Signals" */
  macroSectionLabel: string;
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

  // --- Property header ---
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
    y -= 16;
  }

  // --- CRE Signal Risk Index™ ---
  page.drawText("CRE Signal Risk Index™", {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  const scoreText =
    params.riskIndexScore != null && params.riskIndexBand
      ? `Score: ${params.riskIndexScore} — ${params.riskIndexBand}`
      : "—";
  page.drawText(scoreText, {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 18;

  // --- Key Assumptions (top 6) ---
  if (params.assumptions.length > 0 && drawSectionTitle("Key Assumptions")) {
    for (const row of params.assumptions) {
      if (!drawLine(formatAssumption(row), 9, false, rgb(0.25, 0.25, 0.25))) break;
    }
    y -= 8;
  }

  // --- Primary Risks (top 3): title, severity/confidence, why it matters, diligence action ---
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

  // --- Macro Signals (single deduped section) ---
  if (params.macroSignals.length > 0 && drawSectionTitle(params.macroSectionLabel)) {
    for (const m of params.macroSignals) {
      if (!drawLine(m.display_text, 8, false, rgb(0.3, 0.3, 0.3))) break;
    }
  }

  // --- Footer (fixed at bottom) ---
  const auditParts = [
    `Scan: ${params.scanTimestamp}`,
    `ID: ${params.scanId}`,
    params.model ? `Model: ${params.model}` : null,
    params.promptVersion ? `Prompt: ${params.promptVersion}` : null,
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
