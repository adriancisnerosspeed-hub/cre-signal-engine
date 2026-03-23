import { describe, it, expect } from "vitest";
import { computeRiskIndex, scoreToBand } from "./riskIndex";

// Fixed inputs for determinism testing — use canonical assumption keys
const FIXED_RISKS = [
  { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" },
  { severity_current: "Medium", confidence: "Medium", risk_type: "VacancyUnderstated" },
  { severity_current: "Low", confidence: "High", risk_type: "RentGrowthAggressive" },
];

const FIXED_ASSUMPTIONS = {
  ltv: { value: 72, unit: "%", confidence: "High" },
  cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
  exit_cap: { value: 6.0, unit: "%", confidence: "High" },
  vacancy: { value: 12, unit: "%", confidence: "High" },
  noi_year1: { value: 660000, unit: "USD", confidence: "High" },
  purchase_price: { value: 12000000, unit: "USD", confidence: "High" },
  hold_period_years: { value: 5, unit: "years", confidence: "High" },
  rent_growth: { value: 3, unit: "%", confidence: "High" },
  debt_rate: { value: 5, unit: "%", confidence: "High" },
  expense_growth: { value: 3, unit: "%", confidence: "High" },
};

describe("computeRiskIndex determinism", () => {
  it("produces identical score for identical inputs across 10 calls", () => {
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const result = computeRiskIndex({
        risks: FIXED_RISKS,
        assumptions: FIXED_ASSUMPTIONS,
        macroLinkedCount: 2,
        macroDecayedWeight: 1.5,
      });
      results.push(result.score);
    }

    // All 10 results must be identical
    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(first);
    }
  });

  it("produces identical band for identical inputs", () => {
    const result1 = computeRiskIndex({
      risks: FIXED_RISKS,
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 1,
    });
    const result2 = computeRiskIndex({
      risks: FIXED_RISKS,
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 1,
    });

    expect(result1.score).toBe(result2.score);
    expect(result1.band).toBe(result2.band);
    expect(result1.breakdown.penalty_total).toBe(result2.breakdown.penalty_total);
    expect(result1.breakdown.stabilizer_benefit).toBe(result2.breakdown.stabilizer_benefit);
  });

  it("produces identical breakdown contributions", () => {
    const result1 = computeRiskIndex({
      risks: FIXED_RISKS,
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 0,
    });
    const result2 = computeRiskIndex({
      risks: FIXED_RISKS,
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 0,
    });

    expect(result1.breakdown.contributions).toEqual(result2.breakdown.contributions);
    expect(result1.breakdown.contribution_pct).toEqual(result2.breakdown.contribution_pct);
    expect(result1.breakdown.top_drivers).toEqual(result2.breakdown.top_drivers);
  });

  it("score changes predictably when inputs change", () => {
    const baseline = computeRiskIndex({
      risks: FIXED_RISKS,
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 0,
    });

    // Adding a High severity risk should increase the score
    const withExtraRisk = computeRiskIndex({
      risks: [...FIXED_RISKS, { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" }],
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 0,
    });

    expect(withExtraRisk.score).toBeGreaterThanOrEqual(baseline.score);
  });

  it("empty risks produce a score at or near BASE_SCORE", () => {
    const result = computeRiskIndex({
      risks: [],
      assumptions: FIXED_ASSUMPTIONS,
      macroLinkedCount: 0,
    });

    // BASE_SCORE is 40, stabilizers may reduce it
    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("v3 band thresholds", () => {
  it("scoreToBand boundaries: Low 0-32, Moderate 33-53, Elevated 54-68, High 69+", () => {
    expect(scoreToBand(0)).toBe("Low");
    expect(scoreToBand(32)).toBe("Low");
    expect(scoreToBand(33)).toBe("Moderate");
    expect(scoreToBand(53)).toBe("Moderate");
    expect(scoreToBand(54)).toBe("Elevated");
    expect(scoreToBand(68)).toBe("Elevated");
    expect(scoreToBand(69)).toBe("High");
    expect(scoreToBand(100)).toBe("High");
  });
});

describe("v3 completeness penalty", () => {
  it("adds penalty when assumptions are sparse", () => {
    const sparseResult = computeRiskIndex({
      risks: [{ severity_current: "Medium", confidence: "High", risk_type: "DebtCostRisk" }],
      assumptions: {}, // 0% completeness → 4 point penalty
      macroLinkedCount: 0,
    });
    const fullResult = computeRiskIndex({
      risks: [{ severity_current: "Medium", confidence: "High", risk_type: "DebtCostRisk" }],
      assumptions: FIXED_ASSUMPTIONS, // 100% completeness → 0 penalty
      macroLinkedCount: 0,
    });
    expect(sparseResult.score).toBeGreaterThan(fullResult.score);
  });
});

describe("v3 missing-debt-rate penalty", () => {
  it("adds 2 points when debt_rate missing and LTV > 65", () => {
    const noDebtRate = computeRiskIndex({
      risks: [{ severity_current: "Medium", confidence: "High", risk_type: "DebtCostRisk" }],
      assumptions: { ...FIXED_ASSUMPTIONS, debt_rate: undefined },
      macroLinkedCount: 0,
    });
    const withDebtRate = computeRiskIndex({
      risks: [{ severity_current: "Medium", confidence: "High", risk_type: "DebtCostRisk" }],
      assumptions: FIXED_ASSUMPTIONS, // LTV 72, debt_rate present
      macroLinkedCount: 0,
    });
    // Missing debt_rate at LTV 72 adds penalty
    expect(noDebtRate.score).toBeGreaterThan(withDebtRate.score);
  });
});
