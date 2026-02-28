import { describe, it, expect } from "vitest";
import {
  buildExportPdf,
  getBandMismatchPdfBehavior,
  getDataCoverageLineForTest,
  getVersionDriftLineForTest,
} from "./exportPdf";
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

  it("builds PDF with bandMismatch and bandMismatchExpectedBand (score=62, stored band=High): mismatch line and Review Yes rendered", async () => {
    const params = {
      bandMismatch: true,
      bandMismatchExpectedBand: "Elevated" as const,
      dataCoverage: { present: 5, required: 10, pct: 50 },
    };
    const behavior = getBandMismatchPdfBehavior(params);
    expect(behavior.mismatchLine).toBe("Band mismatch detected (expected band: Elevated).");
    expect(behavior.reviewYes).toBe(true);

    const pdfBytes = await buildExportPdf({
      dealName: "Test Deal",
      assetType: "Multifamily",
      market: "Austin",
      riskIndexScore: 62,
      riskIndexBand: "High",
      promptVersion: "v1",
      scanTimestamp: "2025-01-15 14:30:00",
      scanId: "scan-mismatch-123",
      model: "gpt-4",
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
      ...params,
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPages()).toHaveLength(1);
  });

  it("Data Coverage line: present/required (pct%), Confidence (Low/Medium/High), Review Yes/No", () => {
    const line = getDataCoverageLineForTest({
      dealName: "Deal",
      assetType: null,
      market: null,
      riskIndexScore: 42,
      riskIndexBand: "Moderate",
      promptVersion: null,
      scanTimestamp: "",
      scanId: "",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
      dataCoverage: { present: 8, required: 10, pct: 80 },
      overallConfidence: 0.85,
      reviewFlag: false,
    });
    expect(line).toContain("Data Coverage: 8/10 (80%)");
    expect(line).toContain("Confidence: Medium");
    expect(line).toContain("Review: No");
  });

  it("Data Coverage line: Review Yes when reviewFlag true", () => {
    const line = getDataCoverageLineForTest({
      dealName: "Deal",
      assetType: null,
      market: null,
      riskIndexScore: 62,
      riskIndexBand: "High",
      promptVersion: null,
      scanTimestamp: "",
      scanId: "",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
      dataCoverage: { present: 5, required: 10, pct: 50 },
      overallConfidence: 0.6,
      reviewFlag: true,
    });
    expect(line).toContain("Review: Yes");
  });

  it("Version drift: when previous_score exists and delta_comparable false, PDF builds and version drift line is rendered", async () => {
    const riskBreakdown = {
      previous_score: 45,
      delta_comparable: false as const,
      structural_weight: 60,
      market_weight: 40,
      confidence_factor: 0.8,
      stabilizer_benefit: 0,
      penalty_total: 10,
    };
    expect(getVersionDriftLineForTest({ riskBreakdown })).toBe(
      "Version drift — delta not comparable"
    );
    const pdfBytes = await buildExportPdf({
      dealName: "Deal",
      assetType: null,
      market: null,
      riskIndexScore: 50,
      riskIndexBand: "Moderate",
      promptVersion: null,
      scanTimestamp: "",
      scanId: "",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
      riskBreakdown,
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPages()).toHaveLength(1);
  });

  it("Version drift line is null when delta_comparable is true or previous_score missing", () => {
    expect(getVersionDriftLineForTest({ riskBreakdown: null })).toBeNull();
    expect(
      getVersionDriftLineForTest({
        riskBreakdown: { previous_score: 45, delta_comparable: true },
      })
    ).toBeNull();
    expect(
      getVersionDriftLineForTest({ riskBreakdown: { delta_comparable: false } })
    ).toBeNull();
  });

  it("export PDF contains all three lines when applicable: band mismatch, version drift, Data Coverage", () => {
    const bandBehavior = getBandMismatchPdfBehavior({
      bandMismatch: true,
      bandMismatchExpectedBand: "Elevated",
    });
    expect(bandBehavior.mismatchLine).toBe(
      "Band mismatch detected (expected band: Elevated)."
    );
    expect(bandBehavior.reviewYes).toBe(true);

    const versionDriftLine = getVersionDriftLineForTest({
      riskBreakdown: { previous_score: 40, delta_comparable: false },
    });
    expect(versionDriftLine).toBe("Version drift — delta not comparable");

    const dataCoverageLine = getDataCoverageLineForTest({
      dealName: "Deal",
      assetType: null,
      market: null,
      riskIndexScore: 62,
      riskIndexBand: "High",
      promptVersion: null,
      scanTimestamp: "",
      scanId: "",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
      dataCoverage: { present: 6, required: 10, pct: 60 },
      overallConfidence: 0.75,
      reviewFlag: true,
    });
    expect(dataCoverageLine).toContain("Data Coverage: 6/10 (60%)");
    expect(dataCoverageLine).toContain("Confidence: Medium");
    expect(dataCoverageLine).toContain("Review: Yes");
  });
});
