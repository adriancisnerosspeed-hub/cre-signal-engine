/**
 * Methodology PDF export using pdf-lib (same pipeline as deal export).
 * Page 1: title + Table of Contents. Then body with section headings; footer on every page.
 * Headings never orphan (page break before heading if &lt; MIN_SECTION_SPACE remains).
 */

import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
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

/** Minimum vertical space before starting a new section (avoid orphan heading at bottom). */
const MIN_SECTION_SPACE = 48;

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

  const lineHeight = (size: number) => size * 1.25;
  const headingSize = 12;
  const bodySize = 10;

  /** Footer on every page: version, generated timestamp, disclaimer. */
  function drawFooter(
    currentPage: PDFPage,
    versionLabel: string,
    generatedLabel: string
  ): void {
    const footerY = MARGIN + 50;
    const disclaimerY = MARGIN + 32;
    currentPage.drawText(
      sanitizeForPdf(`Version ${versionLabel} · Generated ${generatedLabel}`),
      {
        x: MARGIN,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
        maxWidth: contentWidth,
      }
    );
    const disclaimerText =
      disclaimerLines[0] ??
      "Underwriting support tool; not investment advice.";
    currentPage.drawText(sanitizeForPdf(disclaimerText), {
      x: MARGIN,
      y: disclaimerY,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
      maxWidth: contentWidth,
    });
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageIndex = 0;
  const tocEntries: { title: string; pageIndex: number }[] = [];

  function ensureSpace(required: number): void {
    if (y - required < MIN_Y) {
      drawFooter(page, version, generatedAt);
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageIndex = doc.getPages().length - 1;
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
    tocEntries.push({ title: heading, pageIndex });
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

  // --- Body content (sections only; title + TOC added on first page after) ---
  ensureSpace(80);
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
        const wrapped = wrapText(
          bullet,
          bulletContentWidth,
          bodySize,
          font
        );
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

  drawFooter(page, version, generatedAt);

  // --- Insert page 0: title + Table of Contents ---
  const tocPage = doc.insertPage(0, [PAGE_WIDTH, PAGE_HEIGHT]);
  let tocY = PAGE_HEIGHT - MARGIN;

  tocPage.drawText(sanitizeForPdf("CRE Signal Risk Index™ — Methodology"), {
    x: MARGIN,
    y: tocY,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  tocY -= 22;
  tocPage.drawText(
    sanitizeForPdf(`Version ${version} · Generated ${generatedAt}`),
    {
      x: MARGIN,
      y: tocY,
      size: bodySize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );
  tocY -= 20;

  tocPage.drawText("Table of Contents", {
    x: MARGIN,
    y: tocY,
    size: headingSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  tocY -= lineHeight(headingSize) + 8;

  const tocFontSize = 10;
  for (const entry of tocEntries) {
    const pageNum = entry.pageIndex + 2; // 1-based; +1 for TOC page
    const titleSafe = sanitizeForPdf(entry.title);
    const numStr = String(pageNum);
    const numWidth = font.widthOfTextAtSize(numStr, tocFontSize);
    tocPage.drawText(titleSafe, {
      x: MARGIN,
      y: tocY,
      size: tocFontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: contentWidth - 24 - numWidth,
    });
    tocPage.drawText(numStr, {
      x: PAGE_WIDTH - MARGIN - numWidth,
      y: tocY,
      size: tocFontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    tocY -= lineHeight(tocFontSize);
  }

  drawFooter(tocPage, version, generatedAt);

  return doc.save();
}
