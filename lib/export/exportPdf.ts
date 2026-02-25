/**
 * Institutional PDF export. No model provider or AI branding.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  risks: { risk_type: string; severity_current: string; recommended_action: string | null }[];
  macroOverlay: { risk_type: string; link_reasons: string[] }[];
};

export async function buildExportPdf(params: ExportPdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  const page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawLine = (text: string, size: number, bold: boolean, color = rgb(0, 0, 0)) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color,
      maxWidth: contentWidth,
    });
    y -= size * 1.3;
  };

  // Property header
  page.drawText(params.dealName, {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 24;
  const sub = [params.assetType, params.market].filter(Boolean).join(" · ");
  if (sub) {
    page.drawText(sub, {
      x: margin,
      y,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 18;
  }

  // CRE Signal Risk Index™ prominently
  page.drawText("CRE Signal Risk Index™", {
    x: margin,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;
  const scoreText =
    params.riskIndexScore != null && params.riskIndexBand
      ? `Score: ${params.riskIndexScore} — ${params.riskIndexBand}`
      : "—";
  page.drawText(scoreText, {
    x: margin,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 24;

  // Primary risks
  page.drawText("Primary Risks", {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  for (const r of params.risks) {
    drawLine(`${r.risk_type} (${r.severity_current})`, 10, true);
    if (r.recommended_action)
      drawLine(r.recommended_action, 9, false, rgb(0.3, 0.3, 0.3));
    y -= 4;
  }
  y -= 12;

  // Linked macro signals
  page.drawText("Linked Macro Signals", {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;
  for (const m of params.macroOverlay) {
    drawLine(m.risk_type, 10, true);
    for (const reason of m.link_reasons)
      drawLine(reason, 9, false, rgb(0.3, 0.3, 0.3));
    y -= 4;
  }
  y -= 12;

  // Timestamp & prompt version
  page.drawText(
    `Scan: ${params.scanTimestamp}${params.promptVersion ? ` · Prompt version: ${params.promptVersion}` : ""}`,
    {
      x: margin,
      y: margin + 50,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    }
  );

  // Footer disclaimer
  page.drawText(DISCLAIMER, {
    x: margin,
    y: margin + 32,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
    maxWidth: contentWidth,
  });

  return doc.save();
}
