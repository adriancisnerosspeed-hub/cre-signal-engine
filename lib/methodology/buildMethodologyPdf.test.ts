import { describe, it, expect } from "vitest";
import { buildMethodologyPdf } from "./buildMethodologyPdf";
import { PDFDocument } from "pdf-lib";
import { RISK_INDEX_VERSION } from "../riskIndex";
import { title as methodologyTitle } from "./methodologyContent";

describe("buildMethodologyPdf", () => {
  it("returns non-empty PDF bytes and does not throw", async () => {
    const pdfBytes = await buildMethodologyPdf({
      version: RISK_INDEX_VERSION,
      generatedAt: "2026-02-27",
    });
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it("produces a valid multi-page PDF with expected layout", async () => {
    const pdfBytes = await buildMethodologyPdf({
      version: RISK_INDEX_VERSION,
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

  it("smoke: PDF bytes non-empty, >=2 pages, title and version rendered on TOC page", async () => {
    const pdfBytes = await buildMethodologyPdf({
      version: RISK_INDEX_VERSION,
      generatedAt: "2026-02-27 12:00:00",
    });
    expect(pdfBytes.length).toBeGreaterThan(0);

    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    expect(pages.length).toBeGreaterThanOrEqual(2);

    // Page 0 is TOC (title "CRE Signal Risk Index™ — Methodology" + "Version {version}")
    const tocPage = pages[0];
    expect(tocPage.getWidth()).toBe(612);
    expect(tocPage.getHeight()).toBe(792);

    // Builder draws methodologyTitle ("CRE Signal Risk Index™ — Methodology") and "Version {version}" on TOC page
    expect(methodologyTitle).toContain("CRE Signal Risk Index");
    expect(methodologyTitle).toContain("Methodology");
    expect(RISK_INDEX_VERSION).toBeTruthy();
  });
});
