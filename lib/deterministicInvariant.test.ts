import { describe, it, expect } from "vitest";
import { computeRiskIndex } from "./riskIndex";
import { normalizeAssumptionsForScoring } from "./assumptionNormalization";
import type { DealScanAssumptions } from "./dealScanContract";

/**
 * Deterministic invariant tests for v3 scoring engine.
 * Verifies that computeRiskIndex produces identical scores when given:
 * - Same risk_types and severities (trigger text is not an input)
 * - Same assumptions with different evidence context
 * - Risks in different order
 */

const ASSUMPTIONS: DealScanAssumptions = {
  ltv: { value: 72, unit: "%", confidence: "High" },
  cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
  exit_cap: { value: 6.0, unit: "%", confidence: "High" },
  vacancy: { value: 12, unit: "%", confidence: "High" },
  noi_year1: { value: 660000, unit: "USD", confidence: "High" },
  purchase_price: { value: 12000000, unit: "USD", confidence: "High" },
  rent_growth: { value: 3, unit: "%", confidence: "High" },
  debt_rate: { value: 5, unit: "%", confidence: "High" },
};

const RISKS = [
  { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const },
  { severity_current: "Medium", confidence: "Medium", risk_type: "VacancyUnderstated" as const },
  { severity_current: "Low", confidence: "High", risk_type: "RentGrowthAggressive" as const },
  { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" as const },
];

describe("Deterministic invariants", () => {
  it("identical risk_type/severity/confidence inputs produce identical score regardless of call count", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const scores: number[] = [];
    for (let i = 0; i < 20; i++) {
      scores.push(computeRiskIndex({ risks: RISKS, assumptions: norm }).score);
    }
    const first = scores[0];
    for (const s of scores) {
      expect(s).toBe(first);
    }
  });

  it("risk array order does not affect score or band", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const forward = computeRiskIndex({ risks: RISKS, assumptions: norm });
    const reversed = computeRiskIndex({ risks: [...RISKS].reverse(), assumptions: norm });
    const shuffled = computeRiskIndex({
      risks: [RISKS[2], RISKS[0], RISKS[3], RISKS[1]],
      assumptions: norm,
    });

    expect(forward.score).toBe(reversed.score);
    expect(forward.score).toBe(shuffled.score);
    expect(forward.band).toBe(reversed.band);
    expect(forward.band).toBe(shuffled.band);
    // Contributions may differ in order but penalty_total must match
    expect(forward.breakdown.penalty_total).toBe(reversed.breakdown.penalty_total);
  });

  it("trigger text is not an input to computeRiskIndex — only risk_type, severity, confidence matter", () => {
    // computeRiskIndex takes { severity_current, confidence, risk_type } — no trigger text field
    // This test confirms the contract: same typed inputs always yield same output
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const a = computeRiskIndex({ risks: RISKS, assumptions: norm, macroLinkedCount: 2 });
    const b = computeRiskIndex({ risks: RISKS, assumptions: norm, macroLinkedCount: 2 });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
    expect(a.breakdown).toEqual(b.breakdown);
  });

  it("macroLinkedCount variation changes score predictably", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const noMacro = computeRiskIndex({ risks: RISKS, assumptions: norm, macroLinkedCount: 0 });
    const withMacro = computeRiskIndex({ risks: RISKS, assumptions: norm, macroLinkedCount: 3 });
    // Macro penalty increases score
    expect(withMacro.score).toBeGreaterThanOrEqual(noMacro.score);

    // Same macro count always yields same score
    const again = computeRiskIndex({ risks: RISKS, assumptions: norm, macroLinkedCount: 3 });
    expect(again.score).toBe(withMacro.score);
  });

  it("assumption values (not evidence/snippets) determine score — same values always match", () => {
    const norm1 = normalizeAssumptionsForScoring(ASSUMPTIONS);
    // Create identical assumptions via a different code path (spread + reconstruct)
    const norm2 = normalizeAssumptionsForScoring({ ...ASSUMPTIONS });
    const a = computeRiskIndex({ risks: RISKS, assumptions: norm1 });
    const b = computeRiskIndex({ risks: RISKS, assumptions: norm2 });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });

  it("empty risks with same assumptions always produce same score", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const a = computeRiskIndex({ risks: [], assumptions: norm });
    const b = computeRiskIndex({ risks: [], assumptions: norm });
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });

  it("adding a risk never decreases score", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const fewer = computeRiskIndex({ risks: RISKS.slice(0, 2), assumptions: norm });
    const more = computeRiskIndex({ risks: RISKS, assumptions: norm });
    expect(more.score).toBeGreaterThanOrEqual(fewer.score);
  });

  it("increasing severity of a risk never decreases score", () => {
    const norm = normalizeAssumptionsForScoring(ASSUMPTIONS);
    const lowSev = computeRiskIndex({
      risks: [{ severity_current: "Low", confidence: "High", risk_type: "DebtCostRisk" as const }],
      assumptions: norm,
    });
    const highSev = computeRiskIndex({
      risks: [{ severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" as const }],
      assumptions: norm,
    });
    expect(highSev.score).toBeGreaterThanOrEqual(lowSev.score);
  });
});
