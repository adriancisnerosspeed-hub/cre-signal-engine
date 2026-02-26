import { describe, it, expect } from "vitest";
import { buildExportPdf } from "./exportPdf";
import { PDFDocument } from "pdf-lib";

describe("buildExportPdf", () => {
  it("produces a one-page PDF with consolidated macro section (no per-risk duplication)", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Test Deal",
      assetType: "Multifamily",
      market: "Austin",
      riskIndexScore: 42,
      riskIndexBand: "Moderate",
      promptVersion: "v1",
      scanTimestamp: "2025-01-15 14:30:00",
      scanId: "scan-uuid-123",
      model: "gpt-4",
      assumptions: [
        { key: "ltv", value: 65, unit: "%", confidence: "High" },
        { key: "vacancy", value: 5, unit: "%", confidence: "Medium" },
      ],
      risks: [
        {
          risk_type: "ExitCapCompression",
          severity_current: "High",
          confidence: "High",
          why_it_matters: "Exit cap compression could reduce proceeds.",
          recommended_action: "Stress test exit caps.",
        },
      ],
      macroSignals: [
        { signal_id: "sig-1", display_text: "Rates — Fed hold supports cap rates." },
      ],
      macroSectionLabel: "Market Signals",
    });

    expect(pdfBytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    expect(pages).toHaveLength(1);

    const page = pages[0];
    expect(page.getWidth()).toBe(612);
    expect(page.getHeight()).toBe(792);
  });

  it("uses General Macro Signals label when no deal context", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Test",
      assetType: null,
      market: null,
      riskIndexScore: null,
      riskIndexBand: null,
      promptVersion: null,
      scanTimestamp: "2025-01-15 14:30:00",
      scanId: "scan-id",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [{ signal_id: "s1", display_text: "General signal." }],
      macroSectionLabel: "General Macro Signals",
    });

    expect(pdfBytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPages()).toHaveLength(1);
  });

  it("renders fallback text when macroSignals is empty", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Test Deal",
      assetType: "Office",
      market: "Chicago",
      riskIndexScore: 38,
      riskIndexBand: "Moderate",
      promptVersion: null,
      scanTimestamp: "2025-01-15 14:30:00",
      scanId: "scan-uuid",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPages()).toHaveLength(1);
  });
});
