/**
 * Methodology PDF export using pdf-lib (same pipeline as deal export).
 * 2–3 pages, footer on every page, section-heading pagination to avoid widows.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  sections,
  disclaimerLines,
  type MethodologySection,
} from "./methodologyContent";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const FOOTER_BLOCK_HEIGHT = 72;
const MIN_Y = MARGIN + FOOTER_BLOCK_HEIGHT;
const BULLET_INDENT = 14;

/** Minimum vertical space required before starting a new section (avoid orphan heading). */
const MIN_SECTION_SPACE = 40;

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

export type BuildMethodologyPdfParams = {
  version: string;
  generatedAt: string;
};

export async function buildMethodologyPdf(
  params: BuildMethodologyPdfParams
): Promise<Uint8Array> {
  const { version, generatedAt } = params;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const bulletContentWidth = contentWidth - BULLET_INDENT;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const lineHeight = (size: number) => size * 1.25;
  const headingSize = 11;
  const bodySize = 9;
  const headingTotalHeight = lineHeight(headingSize) + 4;

  function drawFooter(
    p: { getY: () => number },
    currentPage: typeof page
  ): void {
    const footerY = MARGIN + 50;
    const disclaimerY = MARGIN + 32;
    currentPage.drawText(
      sanitizeForPdf(
        `CRE Signal Engine — Risk Index Methodology v${version} · ${generatedAt}`
      ),
      {
        x: MARGIN,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
        maxWidth: contentWidth,
      }
    );
    const disclaimerText = disclaimerLines[0] ?? "Underwriting support tool; not investment advice.";
    currentPage.drawText(sanitizeForPdf(disclaimerText), {
      x: MARGIN,
      y: disclaimerY,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
      maxWidth: contentWidth,
    });
  }

  function ensureSpace(required: number): void {
    if (y - required < MIN_Y) {
      drawFooter({ getY: () => y }, page);
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawLine(
    text: string,
    size: number,
    bold: boolean,
    color = rgb(0.2, 0.2, 0.2),
    indent = 0
  ): boolean {
    if (y < MIN_Y) return false;
    const safe = sanitizeForPdf(text);
    const maxW = contentWidth - indent;
    const lines = wrapText(safe, maxW, size, bold ? fontBold : font);
    for (const line of lines) {
      if (y < MIN_Y) return false;
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font: bold ? fontBold : font,
        color,
        maxWidth: maxW,
      });
      y -= lineHeight(size);
    }
    return true;
  }

  function drawSectionTitle(heading: string): boolean {
    ensureSpace(MIN_SECTION_SPACE);
    if (y < MIN_Y) return false;
    page.drawText(sanitizeForPdf(heading), {
      x: MARGIN,
      y,
      size: headingSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight(headingSize) + 4;
    return true;
  }

  // Title and subtitle
  ensureSpace(60);
  page.drawText(sanitizeForPdf("CRE Signal Risk Index™ — Methodology"), {
    x: MARGIN,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 22;
  page.drawText(
    sanitizeForPdf(`Version ${version} · Generated ${generatedAt}`),
    {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );
  y -= 20;

  for (const section of sections as MethodologySection[]) {
    if (!drawSectionTitle(section.heading)) continue;

    if ("body" in section && section.body) {
      const paragraphs = section.body.split(/\n/).filter((p) => p.trim());
      for (const para of paragraphs.length ? paragraphs : [section.body]) {
        if (!drawLine(para.trim(), bodySize, false)) break;
      }
      y -= 6;
    }

    if ("bullets" in section && section.bullets?.length) {
      for (const bullet of section.bullets) {
        const wrapped = wrapText(bullet, bulletContentWidth, bodySize, font);
        if (wrapped.length === 0) {
          y -= 2;
          continue;
        }
        if (y < MIN_Y) break;
        page.drawText(sanitizeForPdf("• "), {
          x: MARGIN,
          y,
          size: bodySize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        page.drawText(sanitizeForPdf(wrapped[0]), {
          x: MARGIN + BULLET_INDENT,
          y,
          size: bodySize,
          font,
          color: rgb(0.2, 0.2, 0.2),
          maxWidth: bulletContentWidth,
        });
        y -= lineHeight(bodySize);
        for (let i = 1; i < wrapped.length; i++) {
          if (y < MIN_Y) break;
          page.drawText(sanitizeForPdf(wrapped[i]), {
            x: MARGIN + BULLET_INDENT,
            y,
            size: bodySize,
            font,
            color: rgb(0.2, 0.2, 0.2),
            maxWidth: bulletContentWidth,
          });
          y -= lineHeight(bodySize);
        }
        y -= 2;
      }
      y -= 4;
    }
  }

  drawFooter({ getY: () => y }, page);
  return doc.save();
}
