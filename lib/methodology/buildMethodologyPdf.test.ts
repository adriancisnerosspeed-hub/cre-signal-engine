import { describe, it, expect } from "vitest";
import { buildMethodologyPdf } from "./buildMethodologyPdf";
import { PDFDocument } from "pdf-lib";

describe("buildMethodologyPdf", () => {
  it("returns non-empty PDF bytes and does not throw", async () => {
    const pdfBytes = await buildMethodologyPdf({
      version: "2.0",
      generatedAt: "2026-02-27",
    });
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it("produces a valid multi-page PDF with expected layout", async () => {
    const pdfBytes = await buildMethodologyPdf({
      version: "2.0",
      generatedAt: "2026-02-27 12:00:00",
    });
    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages.length).toBeLessThanOrEqual(5);
    const page = pages[0];
    expect(page.getWidth()).toBe(612);
    expect(page.getHeight()).toBe(792);
  });
});
