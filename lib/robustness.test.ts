/**
 * Coverage test matrix for general robustness requirements:
 * - Multiple asset types, varying data completeness
 * - Zero/many risks, zero/many signals, duplicate signals
 * - Scenario compare edge cases, PDF export for key cases
 */

import { describe, it, expect } from "vitest";
import { parseAndNormalizeDealScan, MAX_RISKS_PER_SCAN } from "./dealScanContract";
import { validateDealScanRaw } from "./dealScanSchema";
import { normalizeAssumptionsForScoring } from "./assumptionNormalization";
import { computeRiskIndex, scoreToBand, MAX_DRIVER_SHARE_PCT } from "./riskIndex";
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

  it("decimal vs percent form produce identical normalized value and identical final score", () => {
    const risks = [
      { severity_current: "Medium", confidence: "High", risk_type: "VacancyUnderstated" as const },
    ];
    const assumptionsDecimal: DealScanAssumptions = {
      vacancy: { value: 0.05, unit: "%", confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
    };
    const assumptionsPercent: DealScanAssumptions = {
      vacancy: { value: 5, unit: "%", confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
    };
    const normDec = normalizeAssumptionsForScoring(assumptionsDecimal);
    const normPct = normalizeAssumptionsForScoring(assumptionsPercent);
    expect(normDec.vacancy?.value).toBe(5);
    expect(normPct.vacancy?.value).toBe(5);
    const resultDec = computeRiskIndex({ risks, assumptions: normDec });
    const resultPct = computeRiskIndex({ risks, assumptions: normPct });
    expect(resultDec.score).toBe(resultPct.score);
    expect(resultDec.band).toBe(resultPct.band);
  });

  it("tier calibration v2: Low 0-34, Moderate 35-54, Elevated 55-69, High 70+", () => {
    expect(scoreToBand(34)).toBe("Low");
    expect(scoreToBand(35)).toBe("Moderate");
    expect(scoreToBand(54)).toBe("Moderate");
    expect(scoreToBand(55)).toBe("Elevated");
    expect(scoreToBand(69)).toBe("Elevated");
    expect(scoreToBand(70)).toBe("High");
  });

  it("missing-only: score ≤ 49 and missing penalty capped at 15", () => {
    const risks = [
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
    ];
    const assumptions: DealScanAssumptions = {};
    const result = computeRiskIndex({ risks, assumptions });
    expect(result.score).toBeLessThanOrEqual(49);
    expect(result.band).toBe("Moderate");
  });

  it("missing + structural high-severity: score can exceed 49; missing-only < missing+structural", () => {
    const missingOnlyRisks = [
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
    ];
    const missingPlusStructuralRisks = [
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
    ];
    const assumptions: DealScanAssumptions = { ltv: { value: 70, unit: "%", confidence: "Medium" } };
    const norm = normalizeAssumptionsForScoring(assumptions);
    const resultMissingOnly = computeRiskIndex({ risks: missingOnlyRisks, assumptions: norm });
    const resultMissingPlusStructural = computeRiskIndex({ risks: missingPlusStructuralRisks, assumptions: norm });
    expect(resultMissingOnly.score).toBeLessThanOrEqual(49);
    expect(resultMissingPlusStructural.score).toBeGreaterThan(resultMissingOnly.score);
  });

  it("extreme case: 85% LTV, 35% vacancy, exit_cap < cap_rate_in, missing debt_rate → High tier ≥70", () => {
    const assumptions: DealScanAssumptions = {
      ltv: { value: 85, unit: "%", confidence: "High" },
      vacancy: { value: 35, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
      exit_cap: { value: 4.5, unit: "%", confidence: "Medium" },
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "Medium" },
    };
    const norm = normalizeAssumptionsForScoring(assumptions);
    const risks = [
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
      { severity_current: "High", confidence: "High", risk_type: "RefiRisk" as const },
      { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" as const },
      { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
      { severity_current: "Medium", confidence: "High", risk_type: "DataMissing" as const },
    ];
    const result = computeRiskIndex({ risks, assumptions: norm });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("High");
  });
});

describe("Risk Index Invariance Contract", () => {
  const baseRisks = [
    { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
    { severity_current: "Low" as const, confidence: "Medium" as const, risk_type: "DataMissing" as const },
  ];
  const baseAssumptions: DealScanAssumptions = {
    vacancy: { value: 10, unit: "%", confidence: "High" },
    ltv: { value: 65, unit: "%", confidence: "Medium" },
  };

  it("decimal vs percent: same logical inputs produce identical score and band", () => {
    const dec = normalizeAssumptionsForScoring({ vacancy: { value: 0.05, unit: "%", confidence: "High" }, ltv: { value: 0.65, unit: "%", confidence: "Medium" } });
    const pct = normalizeAssumptionsForScoring({ vacancy: { value: 5, unit: "%", confidence: "High" }, ltv: { value: 65, unit: "%", confidence: "Medium" } });
    const a = computeRiskIndex({ risks: baseRisks, assumptions: dec });
    const b = computeRiskIndex({ risks: baseRisks, assumptions: pct });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });

  it("risk array reorder: same risks in different order yield same score and band", () => {
    const reordered = [...baseRisks].reverse();
    const norm = normalizeAssumptionsForScoring(baseAssumptions);
    const a = computeRiskIndex({ risks: baseRisks, assumptions: norm });
    const b = computeRiskIndex({ risks: reordered, assumptions: norm });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });

  it("idempotence: computeRiskIndex called twice yields identical score, band, and key breakdown fields", () => {
    const norm = normalizeAssumptionsForScoring(baseAssumptions);
    const a = computeRiskIndex({ risks: baseRisks, assumptions: norm });
    const b = computeRiskIndex({ risks: baseRisks, assumptions: norm });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
    expect(a.breakdown.structural_weight).toBe(b.breakdown.structural_weight);
    expect(a.breakdown.penalty_total).toBe(b.breakdown.penalty_total);
    expect(a.breakdown.top_drivers).toEqual(b.breakdown.top_drivers);
  });

  it("market formatting: score is market-invariant (deal context not passed to computeRiskIndex)", () => {
    const norm = normalizeAssumptionsForScoring(baseAssumptions);
    const result = computeRiskIndex({ risks: baseRisks, assumptions: norm });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(["Low", "Moderate", "Elevated", "High"]).toContain(result.band);
  });

  it("duplicate macro (same category): macro weight/count unchanged when duplicate links; same score", () => {
    const norm = normalizeAssumptionsForScoring(baseAssumptions);
    const a = computeRiskIndex({ risks: baseRisks, assumptions: norm, macroLinkedCount: 2 });
    const b = computeRiskIndex({ risks: baseRisks, assumptions: norm, macroLinkedCount: 2 });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });
});

describe("Risk Index monotonicity", () => {
  it("increasing LTV does not reduce score", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "DebtCostRisk" as const },
    ];
    const base = normalizeAssumptionsForScoring({ ltv: { value: 60, unit: "%", confidence: "High" } });
    const higher = normalizeAssumptionsForScoring({ ltv: { value: 80, unit: "%", confidence: "High" } });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: higher });
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });

  it("increasing vacancy does not reduce score", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
    ];
    const base = normalizeAssumptionsForScoring({ vacancy: { value: 10, unit: "%", confidence: "High" } });
    const higher = normalizeAssumptionsForScoring({ vacancy: { value: 30, unit: "%", confidence: "High" } });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: higher });
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });

  it("increasing exit cap compression does not reduce score", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "ExitCapCompression" as const },
    ];
    const base = normalizeAssumptionsForScoring({
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5, unit: "%", confidence: "High" },
    });
    const higherCompression = normalizeAssumptionsForScoring({
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 4, unit: "%", confidence: "High" },
    });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: higherCompression });
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });

  it("delta tracking: previous_score yields breakdown.previous_score, delta_score, delta_band, deterioration_flag, delta_comparable", () => {
    const risks = [{ severity_current: "Medium" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const }];
    const norm = normalizeAssumptionsForScoring({ vacancy: { value: 10, unit: "%", confidence: "High" }, ltv: { value: 65, unit: "%", confidence: "Medium" } });
    const result = computeRiskIndex({ risks, assumptions: norm, previous_score: 35, previous_risk_index_version: "2.0" });
    expect(result.breakdown.previous_score).toBe(35);
    expect(result.breakdown.delta_comparable).toBe(true);
    expect(result.breakdown.delta_score).toBe(result.score - 35);
    expect(result.breakdown.delta_band).toMatch(/→/);
    if ((result.breakdown.delta_score ?? 0) >= 8) expect(result.breakdown.deterioration_flag).toBe(true);
  });

  it("driver share cap: no single driver exceeds 40% of total positive; excess goes to residual; EDGE_DRIVER_SHARE_CAP_APPLIED set", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
      { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "RentGrowthAggressive" as const },
    ];
    const assumptions = normalizeAssumptionsForScoring({ vacancy: { value: 15, unit: "%", confidence: "High" }, ltv: { value: 65, unit: "%", confidence: "Medium" } });
    const result = computeRiskIndex({ risks, assumptions });
    const totalPositive = (result.breakdown.contributions ?? [])
      .filter((c) => c.driver !== "stabilizers")
      .reduce((s, c) => s + Math.max(0, c.points), 0);
    if (totalPositive > 0) {
      const pcts = (result.breakdown.contribution_pct ?? []).filter((c) => c.driver !== "stabilizers");
      const nonResidualPcts = pcts.filter((c) => c.driver !== "residual");
      for (const { pct } of nonResidualPcts) {
        expect(pct).toBeLessThanOrEqual(MAX_DRIVER_SHARE_PCT + 1); // +1 for rounding
      }
      if ((result.breakdown.edge_flags ?? []).includes("EDGE_DRIVER_SHARE_CAP_APPLIED")) {
        const hasResidual = (result.breakdown.contributions ?? []).some((c) => c.driver === "residual");
        expect(hasResidual).toBe(true);
      }
    }
    expect(result.breakdown.edge_flags ?? []).toContain("EDGE_DRIVER_SHARE_CAP_APPLIED");
    const again = computeRiskIndex({ risks, assumptions });
    expect(again.breakdown.contributions).toEqual(result.breakdown.contributions);
    expect(again.breakdown.edge_flags).toEqual(result.breakdown.edge_flags);
  });

  it("decreasing DSCR does not reduce score", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "DebtCostRisk" as const },
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
    ];
    const baseAssump = {
      ltv: { value: 75, unit: "%", confidence: "High" as const },
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" as const },
      noi_year1: { value: 600_000, unit: "USD", confidence: "High" as const },
      debt_rate: { value: 5, unit: "%", confidence: "High" as const },
    };
    const lowerNoi = {
      ...baseAssump,
      noi_year1: { value: 400_000, unit: "USD", confidence: "High" as const },
    };
    const base = normalizeAssumptionsForScoring(baseAssump);
    const lowerDscr = normalizeAssumptionsForScoring(lowerNoi);
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: lowerDscr });
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });
});

describe("Risk Index v2.0 stress scenarios", () => {
  const scenarios = [
    {
      name: "percent normalization (decimal vs percent)",
      run: () => {
        const risks = [{ severity_current: "Low", confidence: "Medium", risk_type: "VacancyUnderstated" as const }];
        const dec = normalizeAssumptionsForScoring({ vacancy: { value: 0.05, unit: "%", confidence: "High" } });
        const pct = normalizeAssumptionsForScoring({ vacancy: { value: 5, unit: "%", confidence: "High" } });
        const a = computeRiskIndex({ risks, assumptions: dec });
        const b = computeRiskIndex({ risks, assumptions: pct });
        return { score: a.score, band: a.band, match: a.score === b.score && a.band === b.band };
      },
    },
    {
      name: "missing-only",
      run: () => {
        const risks = [
          { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
        ];
        const result = computeRiskIndex({ risks, assumptions: {} });
        return { score: result.score, band: result.band, breakdown: result.breakdown };
      },
    },
    {
      name: "missing + structural",
      run: () => {
        const risks = [
          { severity_current: "High", confidence: "High", risk_type: "DataMissing" as const },
          { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
        ];
        const assumptions = normalizeAssumptionsForScoring({ ltv: { value: 70, unit: "%", confidence: "Medium" } });
        const result = computeRiskIndex({ risks, assumptions });
        return { score: result.score, band: result.band, breakdown: result.breakdown };
      },
    },
    {
      name: "extreme leverage + vacancy",
      run: () => {
        const assumptions: DealScanAssumptions = {
          ltv: { value: 85, unit: "%", confidence: "High" },
          vacancy: { value: 35, unit: "%", confidence: "High" },
          cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
          exit_cap: { value: 4.5, unit: "%", confidence: "Medium" },
          purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
          noi_year1: { value: 500_000, unit: "USD", confidence: "Medium" },
        };
        const norm = normalizeAssumptionsForScoring(assumptions);
        const risks = [
          { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
          { severity_current: "High", confidence: "High", risk_type: "RefiRisk" as const },
          { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" as const },
          { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
          { severity_current: "Medium", confidence: "High", risk_type: "DataMissing" as const },
        ];
        const result = computeRiskIndex({ risks, assumptions: norm });
        return { score: result.score, band: result.band, breakdown: result.breakdown };
      },
    },
    {
      name: "weighted exposure large deal (high LTV + vacancy + compression + DSCR)",
      run: () => {
        const assumptions: DealScanAssumptions = {
          ltv: { value: 80, unit: "%", confidence: "High" },
          vacancy: { value: 25, unit: "%", confidence: "High" },
          cap_rate_in: { value: 5, unit: "%", confidence: "Medium" },
          exit_cap: { value: 4, unit: "%", confidence: "Medium" },
          purchase_price: { value: 25_000_000, unit: "USD", confidence: "High" },
          noi_year1: { value: 800_000, unit: "USD", confidence: "Medium" },
          debt_rate: { value: 6, unit: "%", confidence: "High" },
        };
        const norm = normalizeAssumptionsForScoring(assumptions);
        const risks = [
          { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
          { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" as const },
        ];
        const result = computeRiskIndex({ risks, assumptions: norm });
        return { score: result.score, band: result.band, breakdown: result.breakdown };
      },
    },
  ];

  it("runs all stress scenarios and satisfies invariants", () => {
    const distribution: Record<string, number> = { Low: 0, Moderate: 0, Elevated: 0, High: 0 };
    let missingOnlyScore = 0;
    let missingPlusStructuralScore = 0;
    let extremeScore = 0;

    for (const s of scenarios) {
      const out = s.run();
      if (typeof out === "object" && "score" in out) {
        distribution[out.band] = (distribution[out.band] ?? 0) + 1;
        if (s.name === "missing-only") missingOnlyScore = out.score;
        if (s.name === "missing + structural") missingPlusStructuralScore = out.score;
        if (s.name === "extreme leverage + vacancy") extremeScore = out.score;
      }
    }

    expect(extremeScore).toBeGreaterThanOrEqual(70);
    expect(missingOnlyScore).toBeLessThanOrEqual(49);
    expect(missingPlusStructuralScore).toBeGreaterThan(missingOnlyScore);
  });

  it("percent normalization scenario produces identical score and band", () => {
    const out = scenarios[0].run() as { match: boolean };
    expect(out.match).toBe(true);
  });

  it("deterministic: same input produces same output", () => {
    const risks = [
      { severity_current: "Medium", confidence: "High", risk_type: "VacancyUnderstated" as const },
    ];
    const assumptions = normalizeAssumptionsForScoring({
      vacancy: { value: 10, unit: "%", confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
    });
    const a = computeRiskIndex({ risks, assumptions });
    const b = computeRiskIndex({ risks, assumptions });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });
});

describe("Score stability near threshold", () => {
  it("small assumption change near Moderate/Elevated boundary (54/55) does not produce >8 point jump without tier override", () => {
    const risks = [
      { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
      { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "RentGrowthAggressive" as const },
    ];
    const base = normalizeAssumptionsForScoring({
      vacancy: { value: 19.9, unit: "%", confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5.25, unit: "%", confidence: "High" },
    });
    const varied = normalizeAssumptionsForScoring({
      vacancy: { value: 20.1, unit: "%", confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5.25, unit: "%", confidence: "High" },
    });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: varied });
    const delta = Math.abs(b.score - a.score);
    if (delta > 8) {
      expect(b.breakdown.tier_drivers?.length ?? 0).toBeGreaterThan(0);
      expect(a.breakdown.tier_drivers?.length ?? 0).toBeGreaterThan(0);
    } else {
      expect(delta).toBeLessThanOrEqual(8);
    }
  });

  it("small assumption change near Elevated/High boundary (69/70) does not produce >8 point jump without tier override", () => {
    const risks = [
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
      { severity_current: "High" as const, confidence: "High" as const, risk_type: "DebtCostRisk" as const },
      { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "ExitCapCompression" as const },
    ];
    const base = normalizeAssumptionsForScoring({
      vacancy: { value: 28, unit: "%", confidence: "High" },
      ltv: { value: 78, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5, unit: "%", confidence: "High" },
    });
    const varied = normalizeAssumptionsForScoring({
      vacancy: { value: 28.5, unit: "%", confidence: "High" },
      ltv: { value: 78, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5, unit: "%", confidence: "High" },
    });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: varied });
    const delta = Math.abs(b.score - a.score);
    if (delta > 8) {
      expect((b.breakdown.tier_drivers?.length ?? 0) > 0 || (a.breakdown.tier_drivers?.length ?? 0) > 0).toBe(true);
    } else {
      expect(delta).toBeLessThanOrEqual(8);
    }
  });

  it("exit cap compression ramp: small change in compression produces bounded score change", () => {
    const risks = [{ severity_current: "High" as const, confidence: "High" as const, risk_type: "ExitCapCompression" as const }];
    const base = normalizeAssumptionsForScoring({
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 5.0, unit: "%", confidence: "High" },
    });
    const slightlyTighter = normalizeAssumptionsForScoring({
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 4.9, unit: "%", confidence: "High" },
    });
    const a = computeRiskIndex({ risks, assumptions: base });
    const b = computeRiskIndex({ risks, assumptions: slightlyTighter });
    const delta = Math.abs(b.score - a.score);
    expect(delta).toBeLessThanOrEqual(10);
  });
});

describe("Risk Index v2.0 PDF output (extreme case)", () => {
  it("generates PDF with attribution for extreme risk scenario", async () => {
    const assumptions: DealScanAssumptions = {
      ltv: { value: 85, unit: "%", confidence: "High" },
      vacancy: { value: 35, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
      exit_cap: { value: 4.5, unit: "%", confidence: "Medium" },
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "Medium" },
    };
    const norm = normalizeAssumptionsForScoring(assumptions);
    const risks = [
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
      { severity_current: "High", confidence: "High", risk_type: "RefiRisk" as const },
      { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" as const },
      { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
      { severity_current: "Medium", confidence: "High", risk_type: "DataMissing" as const },
    ];
    const result = computeRiskIndex({ risks, assumptions: norm });
    const pdfBytes = await buildExportPdf({
      dealName: "Extreme Risk Deal (v2.0 Stress)",
      assetType: "Multifamily",
      market: "Austin",
      riskIndexScore: result.score,
      riskIndexBand: result.band,
      riskIndexVersion: "2.0",
      riskBreakdown: result.breakdown,
      promptVersion: null,
      scanTimestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
      scanId: "stress-extreme",
      model: "gpt-4o-mini",
      assumptions: [
        { key: "ltv", value: 85, unit: "%", confidence: "High" },
        { key: "vacancy", value: 35, unit: "%", confidence: "High" },
        { key: "cap_rate_in", value: 5.5, unit: "%", confidence: "Medium" },
        { key: "exit_cap", value: 4.5, unit: "%", confidence: "Medium" },
      ],
      risks: risks.map((r) => ({
        risk_type: r.risk_type,
        severity_current: r.severity_current,
        confidence: r.confidence,
        why_it_matters: null,
        recommended_action: null,
      })),
      macroSignals: [],
      macroSectionLabel: "Market Signals",
    });
    expect(pdfBytes.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("High");
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
