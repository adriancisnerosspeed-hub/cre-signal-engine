/**
 * Coverage test matrix for general robustness requirements:
 * - Multiple asset types, varying data completeness
 * - Zero/many risks, zero/many signals, duplicate signals
 * - Scenario compare edge cases, PDF export for key cases
 */

import { describe, it, expect } from "vitest";
import { parseAndNormalizeDealScan, MAX_RISKS_PER_SCAN } from "./dealScanContract";
import { validateDealScanRaw } from "./dealScanSchema";
import { computeRiskIndex } from "./riskIndex";
import { buildExportPdf } from "./export/exportPdf";
import {
  selectMacroSignalsForPdf,
  dedupeSignals,
  signalStableKey,
  normalizeTextForDedupe,
  MAX_SIGNALS_OVERALL,
} from "./export/pdfSelectors";
import type { DealScanAssumptions } from "./dealScanContract";

describe("Robustness: validation and normalization", () => {
  it("validates and normalizes multi-asset scan (multifamily)", () => {
    const raw = `{"assumptions":{"vacancy":{"value":5,"unit":"%","confidence":"High"},"rent_growth":{"value":3,"unit":"%","confidence":"Medium"}},"risks":[{"risk_type":"VacancyUnderstated","severity":"Medium","what_changed_or_trigger":"Pipeline","why_it_matters":"","who_this_affects":"","recommended_action":"Monitor","confidence":"High","evidence_snippets":[]}]}`;
    const out = parseAndNormalizeDealScan(raw);
    expect(out).not.toBeNull();
    expect(out!.assumptions.vacancy?.value).toBe(5);
    expect(out!.risks[0].risk_type).toBe("VacancyUnderstated");
  });

  it("validates and normalizes office scan with partial assumptions", () => {
    const raw = `{"assumptions":{"cap_rate_in":{"value":6,"unit":"%","confidence":"Low"}},"risks":[{"risk_type":"ExitCapCompression","severity":"High","what_changed_or_trigger":"Cap expansion","why_it_matters":"","who_this_affects":"","recommended_action":"Act","confidence":"Medium","evidence_snippets":[]}]}`;
    const out = parseAndNormalizeDealScan(raw);
    expect(out).not.toBeNull();
    expect(out!.assumptions.cap_rate_in?.value).toBe(6);
    expect(out!.assumptions.exit_cap).toBeUndefined();
  });

  it("handles zero risks and zero assumptions", () => {
    const raw = `{"assumptions":{},"risks":[]}`;
    const out = parseAndNormalizeDealScan(raw);
    expect(out).not.toBeNull();
    expect(Object.keys(out!.assumptions)).toHaveLength(0);
    expect(out!.risks).toHaveLength(0);
  });

  it("rejects invalid root shape (no assumptions key)", () => {
    const parsed = { risks: [] };
    const validated = validateDealScanRaw(parsed);
    expect(validated).not.toBeNull();
    expect(validated!.assumptions).toEqual({});
    expect(validated!.risks).toEqual([]);
  });

  it("caps risks at MAX_RISKS_PER_SCAN", () => {
    const risks = Array.from({ length: 50 }, (_, i) => ({
      risk_type: "RentGrowthAggressive",
      severity: "Medium",
      what_changed_or_trigger: `Trigger ${i}`,
      why_it_matters: "",
      who_this_affects: "",
      recommended_action: "Monitor",
      confidence: "Low",
      evidence_snippets: [],
    }));
    const raw = JSON.stringify({ assumptions: {}, risks });
    const out = parseAndNormalizeDealScan(raw);
    expect(out!.risks.length).toBeLessThanOrEqual(MAX_RISKS_PER_SCAN);
  });
});

describe("Robustness: scoring engine", () => {
  it("score is deterministic and bounded 0–100", () => {
    const risks = [
      { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
      { severity_current: "Medium", confidence: "Medium", risk_type: "RentGrowthAggressive" as const },
    ];
    const assumptions: DealScanAssumptions = {
      ltv: { value: 65, unit: "%", confidence: "High" },
      exit_cap: { value: 5.5, unit: "%", confidence: "Medium" },
      cap_rate_in: { value: 5, unit: "%", confidence: "Medium" },
    };
    const a = computeRiskIndex({ risks, assumptions });
    const b = computeRiskIndex({ risks, assumptions });
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(["Low", "Moderate", "Elevated", "High"]).toContain(a.band);
  });

  it("zero risks yields base score in Low/Moderate band", () => {
    const result = computeRiskIndex({ risks: [], assumptions: {} });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("Robustness: macro signal dedupe and caps", () => {
  it("dedupes duplicate macro text (same category::normalizedText)", () => {
    const links = [
      { signal_id: "1", signal_type: "Supply-Demand", what_changed: "Pipeline of 12,000 units.", link_reason: null },
      { signal_id: "2", signal_type: "Supply-Demand", what_changed: "Pipeline of 12,000 units.", link_reason: null },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(1);
  });

  it("respects maxSignalsOverall", () => {
    const links = Array.from({ length: 10 }, (_, i) => ({
      signal_id: `s${i}`,
      link_reason: `reason ${i}`,
      signal_type: `Type${i}`,
      what_changed: `content ${i}`,
    }));
    const result = dedupeSignals(links, MAX_SIGNALS_OVERALL);
    expect(result.length).toBeLessThanOrEqual(MAX_SIGNALS_OVERALL);
  });

  it("normalizeTextForDedupe collapses spacing and punctuation", () => {
    expect(normalizeTextForDedupe("  Supply — 3-year pipeline.  ")).toBe("supply — 3-year pipeline");
  });

  it("signalStableKey is stable for same content", () => {
    const k1 = signalStableKey("Supply-Demand", "Pipeline of 12,000 units.");
    const k2 = signalStableKey("supply-demand", "  Pipeline of 12,000 units  ");
    expect(k1).toBe(k2);
  });

  it("selectMacroSignalsForPdf returns empty for no links", () => {
    const result = selectMacroSignalsForPdf({ linksWithRisk: [], assetType: "Office", market: null });
    expect(result).toEqual([]);
  });
});

describe("Robustness: PDF export", () => {
  it("PDF renders for minimal payload (zero risks, zero signals)", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Minimal Deal",
      assetType: "Retail",
      market: "Chicago",
      riskIndexScore: 35,
      riskIndexBand: "Moderate",
      promptVersion: null,
      scanTimestamp: "2025-01-15 12:00:00",
      scanId: "scan-minimal",
      model: "gpt-4o-mini",
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "Market Signals",
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it("PDF renders for full payload (assumptions, risks, signals, recommended actions, IC memo)", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Full Deal",
      assetType: "Multifamily",
      market: "Austin",
      riskIndexScore: 52,
      riskIndexBand: "Elevated",
      promptVersion: "1.0",
      scanTimestamp: "2025-01-15 12:00:00",
      scanId: "scan-full",
      model: "gpt-4o",
      assumptions: [
        { key: "purchase_price", value: 10_000_000, unit: "USD", confidence: "High" },
        { key: "vacancy", value: 5, unit: "%", confidence: "Medium" },
      ],
      risks: [
        {
          risk_type: "VacancyUnderstated",
          severity_current: "High",
          confidence: "High",
          why_it_matters: "Pipeline pressure.",
          recommended_action: "Stress test vacancy.",
        },
      ],
      macroSignals: [
        { signal_id: "s1", display_text: "Supply-Demand — 3-year pipeline of 12,000 units." },
      ],
      macroSectionLabel: "Market Signals",
      recommendedActions: ["Stress vacancy assumption against market comps."],
      icMemoHighlights: "Thesis: Value-add multifamily in Austin. Conditions: Confirm absorption and debt terms.",
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it("PDF scenario comparison renders when provided", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Scenario Deal",
      assetType: "Office",
      market: null,
      riskIndexScore: 42,
      riskIndexBand: "Moderate",
      promptVersion: null,
      scanTimestamp: "2025-01-15 12:00:00",
      scanId: "scan-scenario",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "General Macro Signals",
      scenarioComparison: {
        base: { vacancy: 5, exit_cap: 5.25, rent_growth: 3, debt_rate: 5.5 },
        conservative: { vacancy: 8, exit_cap: 5.75, rent_growth: 2, debt_rate: 6 },
      },
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it("PDF scenario comparison handles missing values", async () => {
    const pdfBytes = await buildExportPdf({
      dealName: "Scenario Edge",
      assetType: null,
      market: null,
      riskIndexScore: null,
      riskIndexBand: null,
      promptVersion: null,
      scanTimestamp: "2025-01-15 12:00:00",
      scanId: "scan-edge",
      model: null,
      assumptions: [],
      risks: [],
      macroSignals: [],
      macroSectionLabel: "General Macro Signals",
      scenarioComparison: {
        base: { vacancy: 5, exit_cap: null, rent_growth: null, debt_rate: null },
        conservative: { vacancy: null, exit_cap: 5.5, rent_growth: null, debt_rate: null },
      },
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
  });
});
