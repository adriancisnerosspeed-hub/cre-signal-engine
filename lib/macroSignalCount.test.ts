import { describe, it, expect } from "vitest";
import { countUniqueMacroSignals } from "./macroSignalCount";
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
  const baseRisks = [
    { severity_current: "Medium" as const, confidence: "Medium" as const, risk_type: "RentGrowthAggressive" as const },
  ];

  it("macroLinkedCount = 1 => +1 macro penalty (before cap)", () => {
    const a = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 0 });
    const b = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 1 });
    expect(b.score - a.score).toBe(1);
  });

  it("macroLinkedCount = 10 => capped at +4 macro penalty", () => {
    const a = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 0 });
    const b = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 10 });
    expect(b.score - a.score).toBe(4);
  });

  it("duplicates in deal_signal_links cannot increase score beyond cap", () => {
    const with4 = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 4 });
    const with10 = computeRiskIndex({ risks: baseRisks, macroLinkedCount: 10 });
    expect(with10.score).toBe(with4.score);
  });
});
