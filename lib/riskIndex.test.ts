import { describe, it, expect } from "vitest";
import { computeRiskIndex } from "./riskIndex";

// Fixed inputs for determinism testing
const FIXED_RISKS = [
  { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" },
  { severity_current: "Medium", confidence: "Medium", risk_type: "VacancyUnderstated" },
  { severity_current: "Low", confidence: "High", risk_type: "RentGrowthAggressive" },
];

const FIXED_ASSUMPTIONS = {
  ltv: { value: 72, unit: "%" },
  cap_rate_in: { value: 5.5, unit: "%" },
  exit_cap: { value: 6.0, unit: "%" },
  vacancy: { value: 12, unit: "%" },
  noi: { value: 660000, unit: "$" },
  purchase_price: { value: 12000000, unit: "$" },
  hold_period: { value: 5, unit: "years" },
  rent_growth: { value: 3, unit: "%" },
  dscr: { value: 1.25, unit: "x" },
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
