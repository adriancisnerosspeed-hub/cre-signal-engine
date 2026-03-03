/**
 * IC Memorandum Narrative PDF builder.
 * Multi-page, using the same pdf-lib patterns as exportPdf.ts.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

const DISCLAIMER =
  "CRE Signal Risk Index(TM) is an underwriting support tool. Final investment decisions should incorporate sponsor diligence and third-party validation.";

const BAND_COLORS: Record<string, [number, number, number]> = {
  Low:      [0.133, 0.773, 0.369], // #22c55e
  Moderate: [0.918, 0.702, 0.031], // #eab308
  Elevated: [0.976, 0.451, 0.086], // #f97316
  High:     [0.937, 0.267, 0.267], // #ef4444
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const MAX_W = PAGE_W - 2 * MARGIN;
const FOOTER_H = 52; // space reserved at bottom for disclaimer + page num
const MIN_Y = MARGIN + FOOTER_H;

function sanitizeForPdf(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/\u2122/g, "(TM)")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function wrapText(text: string, maxWidth: number, fontSize: number, f: PDFFont): string[] {
  const words = sanitizeForPdf(text).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (f.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Fix A: patterns that identify internal debug strings — never rendered in the PDF
const DEBUG_LINE_PATTERNS: RegExp[] = [
  /^\[Band mismatch/i,
  /^\[band_consistency/i,
  /^\[EDGE_/i,
  /^\[internal/i,
];

function isDebugLine(raw: string): boolean {
  const trimmed = raw.trim();
  return DEBUG_LINE_PATTERNS.some((re) => re.test(trimmed));
}

type MarkdownLine =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "body"; text: string }
  | { type: "blank" };

function parseMarkdownLines(narrative: string): MarkdownLine[] {
  return narrative.split("\n").flatMap((raw): MarkdownLine[] => {
    // Fix A: drop internal debug strings from PDF output
    if (isDebugLine(raw)) return [];
    if (raw.startsWith("### ")) return [{ type: "h3", text: raw.slice(4) }];
    if (raw.startsWith("## "))  return [{ type: "h2", text: raw.slice(3) }];
    if (raw.startsWith("# "))   return [{ type: "h1", text: raw.slice(2) }];
    if (raw.trim() === "")      return [{ type: "blank" }];
    // Strip inline bold markers — section labels in body will be rendered as-is
    return [{ type: "body", text: raw.replace(/\*\*([^*]+)\*\*/g, "$1") }];
  });
}

function drawPageFooter(
  page: PDFPage,
  font: PDFFont,
  pageNum: number,
  totalPages: number
) {
  const footerY = MARGIN + 28;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end:   { x: PAGE_W - MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  // Wrap disclaimer across up to 2 lines
  const disclaimerLines = wrapText(DISCLAIMER, MAX_W - 40, 7, font);
  let dy = footerY;
  for (const line of disclaimerLines) {
    page.drawText(line, { x: MARGIN, y: dy, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
    dy -= 9;
  }
  const pageLabel = `Page ${pageNum} of ${totalPages}`;
  const pw = font.widthOfTextAtSize(pageLabel, 7);
  page.drawText(pageLabel, {
    x: PAGE_W - MARGIN - pw,
    y: footerY,
    size: 7,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });
}

export async function buildIcMemoPdf(params: {
  narrative: string;
  dealName?: string | null;
  scanCreatedAt?: string | null;
  scanId?: string | null;
  riskIndexScore?: number | null;
  riskIndexBand?: string | null;
}): Promise<Uint8Array> {
  const { narrative, dealName, scanCreatedAt, scanId, riskIndexScore, riskIndexBand } = params;

  const pdfDoc = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const allPages: PDFPage[] = [];
  let y = PAGE_H - MARGIN;

  function addPage(): PDFPage {
    const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
    allPages.push(p);
    y = PAGE_H - MARGIN;
    return p;
  }

  function page(): PDFPage {
    return allPages[allPages.length - 1];
  }

  function ensureSpace(needed: number) {
    if (y - needed < MIN_Y) addPage();
  }

  function drawText(
    text: string, x: number, size: number,
    f: PDFFont, color = rgb(0.08, 0.08, 0.08)
  ) {
    page().drawText(sanitizeForPdf(text), { x, y, size, font: f, color });
  }

  function drawWrapped(
    text: string, x: number, maxWidth: number,
    size: number, f: PDFFont, lineH: number,
    color = rgb(0.08, 0.08, 0.08)
  ) {
    const lines = wrapText(text, maxWidth, size, f);
    for (const line of lines) {
      ensureSpace(lineH + 4);
      page().drawText(line, { x, y, size, font: f, color });
      y -= lineH;
    }
  }

  function drawRule(opacity = 0.65) {
    page().drawLine({
      start: { x: MARGIN, y },
      end:   { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(opacity, opacity, opacity),
    });
  }

  // ── Start first page ───────────────────────────────────────────────────────
  addPage();

  // Brand label
  drawText("CRE SIGNAL ENGINE", MARGIN, 8, fontBold, rgb(0.45, 0.45, 0.45));
  y -= 11;
  drawText("IC MEMORANDUM NARRATIVE", MARGIN, 8, font, rgb(0.45, 0.45, 0.45));
  y -= 22;

  // Deal name
  if (dealName) {
    const nameLines = wrapText(dealName, MAX_W, 20, fontBold);
    for (const l of nameLines) {
      page().drawText(l, { x: MARGIN, y, size: 20, font: fontBold, color: rgb(0.05, 0.05, 0.05) });
      y -= 26;
    }
  }

  // Subheader: scan date + truncated scan ID
  const subParts: string[] = [];
  if (scanCreatedAt) {
    subParts.push(`Scan date: ${new Date(scanCreatedAt).toISOString().slice(0, 10)}`);
  }
  if (scanId) {
    subParts.push(`ID: ${scanId.slice(0, 8)}`);
  }
  if (subParts.length) {
    drawText(subParts.join("   |   "), MARGIN, 9, font, rgb(0.45, 0.45, 0.45));
    y -= 14;
  }

  y -= 8;
  drawRule(0.78);
  y -= 18;

  // ── Risk Index ─────────────────────────────────────────────────────────────
  drawText("CRE Signal Risk Index(TM)", MARGIN, 10, fontBold, rgb(0.2, 0.2, 0.2));
  y -= 32;

  const bandColor =
    riskIndexBand && BAND_COLORS[riskIndexBand]
      ? rgb(...BAND_COLORS[riskIndexBand])
      : rgb(0.45, 0.45, 0.45);

  // Score on top line, band directly below; both left-aligned at MARGIN, no overlap.
  if (riskIndexScore != null) {
    ensureSpace(56);
    const scoreStr = String(riskIndexScore);
    page().drawText(scoreStr, { x: MARGIN, y, size: 30, font: fontBold, color: bandColor });
    y -= 36;
    if (riskIndexBand) {
      page().drawText(sanitizeForPdf(riskIndexBand), { x: MARGIN, y, size: 13, font: fontBold, color: bandColor });
      y -= 18;
    }
  } else if (riskIndexBand) {
    ensureSpace(28);
    drawText(riskIndexBand, MARGIN, 14, fontBold, bandColor);
    y -= 22;
  }

  y -= 8;
  drawRule(0.78);
  y -= 20;

  // ── Narrative body ─────────────────────────────────────────────────────────
  const mdLines = parseMarkdownLines(narrative);

  for (const line of mdLines) {
    switch (line.type) {
      // Fix C: h1/h2 at 13pt, h3 at 12pt, body at 10pt — comfortable reading sizes
      case "h1":
      case "h2": {
        ensureSpace(34);
        y -= 6;
        drawWrapped(line.text, MARGIN, MAX_W, 13, fontBold, 17, rgb(0.05, 0.05, 0.05));
        page().drawLine({
          start: { x: MARGIN, y: y + 4 },
          end:   { x: PAGE_W - MARGIN, y: y + 4 },
          thickness: 0.3,
          color: rgb(0.82, 0.82, 0.82),
        });
        y -= 8;
        break;
      }
      case "h3": {
        ensureSpace(24);
        y -= 4;
        drawWrapped(line.text, MARGIN, MAX_W, 12, fontBold, 16, rgb(0.15, 0.15, 0.15));
        y -= 4;
        break;
      }
      case "blank": {
        y -= 7;
        break;
      }
      case "body": {
        ensureSpace(16);
        drawWrapped(line.text, MARGIN, MAX_W, 10, font, 14, rgb(0.12, 0.12, 0.12));
        break;
      }
    }
  }

  // ── Draw footers on all pages ──────────────────────────────────────────────
  const totalPages = allPages.length;
  for (let i = 0; i < totalPages; i++) {
    drawPageFooter(allPages[i], font, i + 1, totalPages);
  }

  return pdfDoc.save();
}
