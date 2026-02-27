import { describe, it, expect } from "vitest";
import { countUniqueMacroSignals, countUniqueMacroCategories } from "./macroSignalCount";
import { computeRiskIndex } from "./riskIndex";

describe("countUniqueMacroSignals", () => {
  it("10 risks linked to the same signal => macroLinkedCount = 1", () => {
    const linkRows = Array.from({ length: 10 }, (_, i) => ({
      deal_risk_id: `risk-${i}`,
      signal_id: "signal-abc",
    }));
    expect(countUniqueMacroSignals(linkRows)).toBe(1);
  });

  it("1 risk linked to 10 unique signals => macroLinkedCount = 10", () => {
    const linkRows = Array.from({ length: 10 }, (_, i) => ({
      deal_risk_id: "risk-1",
      signal_id: `signal-${i}`,
    }));
    expect(countUniqueMacroSignals(linkRows)).toBe(10);
  });

  it("empty links => 0", () => {
    expect(countUniqueMacroSignals([])).toBe(0);
  });

  it("duplicate (same risk, same signal) counted once", () => {
    const linkRows = [
      { deal_risk_id: "r1", signal_id: "s1" },
      { deal_risk_id: "r1", signal_id: "s1" },
    ];
    expect(countUniqueMacroSignals(linkRows)).toBe(1);
  });
});

describe("risk index macro penalty (unique signals)", () => {
  // Use enough structural+market penalty so 35% macro cap allows non-zero macro (plan: macro ≤ 35% of penalty share)
  const baseRisks = [
    { severity_current: "High" as const, confidence: "High" as const, risk_type: "RentGrowthAggressive" as const },
    { severity_current: "High" as const, confidence: "High" as const, risk_type: "VacancyUnderstated" as const },
    { severity_current: "Medium" as const, confidence: "High" as const, risk_type: "ExitCapCompression" as const },
  ];

  it("macroLinkedCount = 1 => +1 macro penalty when penalty share allows", () => {
    const a = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 0 });
    const b = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 1 });
    expect(b.score).toBeGreaterThan(a.score);
    expect(b.score - a.score).toBeGreaterThanOrEqual(1);
  });

  it("macro contribution capped at 35% of penalty share (and at MACRO_CAP)", () => {
    const a = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 0 });
    const b = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 10 });
    expect(b.score).toBeGreaterThan(a.score);
    expect(b.score - a.score).toBeLessThanOrEqual(3);
  });

  it("duplicates in deal_signal_links cannot increase score beyond cap", () => {
    const with3 = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 3 });
    const with10 = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 10 });
    expect(with10.score).toBe(with3.score);
  });
});

describe("countUniqueMacroCategories", () => {
  it("two signals of same category => count = 1", () => {
    const links = [
      { deal_risk_id: "r1", signal_id: "s1", signal_type: "Credit" },
      { deal_risk_id: "r2", signal_id: "s2", signal_type: "Credit" },
    ];
    expect(countUniqueMacroCategories(links)).toBe(1);
  });

  it("two different categories => count = 2", () => {
    const links = [
      { deal_risk_id: "r1", signal_id: "s1", signal_type: "Credit" },
      { deal_risk_id: "r2", signal_id: "s2", signal_type: "Supply-Demand" },
    ];
    expect(countUniqueMacroCategories(links)).toBe(2);
  });

  it("same category different casing => count = 1", () => {
    const links = [
      { deal_risk_id: "r1", signal_id: "s1", signal_type: "credit" },
      { deal_risk_id: "r2", signal_id: "s2", signal_type: "Credit" },
    ];
    expect(countUniqueMacroCategories(links)).toBe(1);
  });

  it("empty or null signal_type excluded", () => {
    const links = [
      { deal_risk_id: "r1", signal_id: "s1", signal_type: "" },
      { deal_risk_id: "r2", signal_id: "s2", signal_type: null },
    ];
    expect(countUniqueMacroCategories(links)).toBe(0);
  });

  it("empty links => 0", () => {
    expect(countUniqueMacroCategories([])).toBe(0);
  });
});
