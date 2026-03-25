import { describe, it, expect } from "vitest";
import { injectDeterministicRisks } from "./riskInjection";
import type { DealScanAssumptions, DealScanRisk } from "./dealScanContract";

/** Helper to build a minimal AI-extracted risk for testing "already exists" guard. */
function makeAiRisk(riskType: string, severity = "Low"): DealScanRisk {
  return {
    risk_type: riskType as DealScanRisk["risk_type"],
    severity: severity as DealScanRisk["severity"],
    what_changed_or_trigger: "AI trigger",
    why_it_matters: "",
    who_this_affects: "",
    recommended_action: "Monitor",
    confidence: "Medium",
    evidence_snippets: [],
  };
}

/* ================================================================
 * DebtCostRisk
 * ================================================================ */
describe("DebtCostRisk injection", () => {
  it("injects Medium when debt_rate >= 6.0% and < 7.0%", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("DebtCostRisk")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "DebtCostRisk");
    expect(risk).toBeDefined();
    expect(risk!.severity).toBe("Medium");
    expect(risk!.confidence).toBe("High");
    expect(risk!.what_changed_or_trigger).toContain("6.85%");
  });

  it("injects High when debt_rate >= 7.0%", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 7.2, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    const risk = r.risks.find((x) => x.risk_type === "DebtCostRisk");
    expect(risk!.severity).toBe("High");
  });

  it("does NOT inject when debt_rate < 6.0%", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 5.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("DebtCostRisk")).toBe(false);
    expect(r.risks.find((x) => x.risk_type === "DebtCostRisk")).toBeUndefined();
  });

  it("does NOT replace when DebtCostRisk already in AI list", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    };
    const existing = makeAiRisk("DebtCostRisk");
    const r = injectDeterministicRisks(a, [existing], "");
    expect(r.injectedTypes.has("DebtCostRisk")).toBe(false);
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0].what_changed_or_trigger).toBe("AI trigger");
  });
});

/* ================================================================
 * RefiRisk
 * ================================================================ */
describe("RefiRisk injection", () => {
  it("injects when debt_rate >= 6.5% AND hold >= 5 years", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("RefiRisk")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "RefiRisk");
    expect(risk!.severity).toBe("Medium");
    expect(risk!.what_changed_or_trigger).toContain("5-year");
    expect(risk!.what_changed_or_trigger).toContain("6.85%");
  });

  it("does NOT inject when debt_rate < 6.5%", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 6.0, unit: "%", confidence: "High" },
      hold_period_years: { value: 7, unit: "years", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("RefiRisk")).toBe(false);
  });

  it("does NOT inject when hold_period_years < 5", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 7.0, unit: "%", confidence: "High" },
      hold_period_years: { value: 3, unit: "years", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("RefiRisk")).toBe(false);
  });

  it("does NOT replace when RefiRisk already exists", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 7.0, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [makeAiRisk("RefiRisk")], "");
    expect(r.injectedTypes.has("RefiRisk")).toBe(false);
  });
});

/* ================================================================
 * VacancyUnderstated
 * ================================================================ */
describe("VacancyUnderstated injection", () => {
  it("injects when vacancy >= 5% and text mentions renovation", () => {
    const a: DealScanAssumptions = {
      vacancy: { value: 7, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "The property is undergoing a $2M renovation");
    expect(r.injectedTypes.has("VacancyUnderstated")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "VacancyUnderstated");
    expect(risk!.severity).toBe("Low");
    expect(risk!.what_changed_or_trigger).toContain("7%");
  });

  it("does NOT inject without construction keywords", () => {
    const a: DealScanAssumptions = {
      vacancy: { value: 10, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "Standard multifamily asset in stable market");
    expect(r.injectedTypes.has("VacancyUnderstated")).toBe(false);
  });

  it("does NOT inject when vacancy < 5%", () => {
    const a: DealScanAssumptions = {
      vacancy: { value: 4, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "Active renovation ongoing");
    expect(r.injectedTypes.has("VacancyUnderstated")).toBe(false);
  });

  it("matches various construction keywords", () => {
    const a: DealScanAssumptions = {
      vacancy: { value: 6, unit: "%", confidence: "High" },
    };
    for (const kw of ["offline units", "redevelopment", "repositioning", "capital improvement", "rehab"]) {
      const r = injectDeterministicRisks(a, [], `Deal involves ${kw}`);
      expect(r.injectedTypes.has("VacancyUnderstated")).toBe(true);
    }
  });
});

/* ================================================================
 * ExitCapCompression
 * ================================================================ */
describe("ExitCapCompression injection", () => {
  it("injects Low when exit_cap > cap_rate_in but spread <= 0.5", () => {
    const a: DealScanAssumptions = {
      exit_cap: { value: 6.1, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("ExitCapCompression")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "ExitCapCompression");
    expect(risk!.severity).toBe("Low");
    expect(risk!.what_changed_or_trigger).toContain("50bps");
    expect(risk!.recommended_action).toBe("Monitor");
  });

  it("injects Medium when exit_cap <= cap_rate_in", () => {
    const a: DealScanAssumptions = {
      exit_cap: { value: 5.3, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    const risk = r.risks.find((x) => x.risk_type === "ExitCapCompression");
    expect(risk!.severity).toBe("Medium");
    expect(risk!.recommended_action).toBe("Act");
  });

  it("does NOT inject when spread > 0.5", () => {
    const a: DealScanAssumptions = {
      exit_cap: { value: 6.5, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("ExitCapCompression")).toBe(false);
  });

  it("injects at exactly 0.5 spread (boundary)", () => {
    const a: DealScanAssumptions = {
      exit_cap: { value: 6.0, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("ExitCapCompression")).toBe(true);
  });
});

/* ================================================================
 * ConstructionTimingRisk
 * ================================================================ */
describe("ConstructionTimingRisk injection", () => {
  it("injects when text has construction keyword", () => {
    const r = injectDeterministicRisks({}, [], "Major construction underway on floors 3-5");
    expect(r.injectedTypes.has("ConstructionTimingRisk")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "ConstructionTimingRisk");
    expect(risk!.severity).toBe("Medium");
    expect(risk!.confidence).toBe("High");
  });

  it("does NOT inject without construction keyword", () => {
    const r = injectDeterministicRisks({}, [], "Stable Class A office in downtown market");
    expect(r.injectedTypes.has("ConstructionTimingRisk")).toBe(false);
  });
});

/* ================================================================
 * RentGrowthAggressive
 * ================================================================ */
describe("RentGrowthAggressive injection", () => {
  it("injects Low when 3.0 <= rent_growth < 4.0", () => {
    const a: DealScanAssumptions = {
      rent_growth: { value: 3.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("RentGrowthAggressive")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "RentGrowthAggressive");
    expect(risk!.severity).toBe("Low");
    expect(risk!.what_changed_or_trigger).toContain("3.5%");
  });

  it("injects Medium when rent_growth >= 4.0", () => {
    const a: DealScanAssumptions = {
      rent_growth: { value: 4.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    const risk = r.risks.find((x) => x.risk_type === "RentGrowthAggressive");
    expect(risk!.severity).toBe("Medium");
  });

  it("does NOT inject when rent_growth < 3.0", () => {
    const a: DealScanAssumptions = {
      rent_growth: { value: 2.5, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("RentGrowthAggressive")).toBe(false);
  });
});

/* ================================================================
 * ExpenseUnderstated
 * ================================================================ */
describe("ExpenseUnderstated injection", () => {
  it("injects when expense_growth < 3.0%", () => {
    const a: DealScanAssumptions = {
      expense_growth: { value: 2.8, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("ExpenseUnderstated")).toBe(true);
    const risk = r.risks.find((x) => x.risk_type === "ExpenseUnderstated");
    expect(risk!.severity).toBe("Low");
    expect(risk!.what_changed_or_trigger).toContain("2.8%");
  });

  it("does NOT inject when expense_growth >= 3.0%", () => {
    const a: DealScanAssumptions = {
      expense_growth: { value: 3.0, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.has("ExpenseUnderstated")).toBe(false);
  });

  it("does NOT inject when expense_growth is null/missing", () => {
    const r1 = injectDeterministicRisks({}, [], "");
    expect(r1.injectedTypes.has("ExpenseUnderstated")).toBe(false);

    const a: DealScanAssumptions = {
      expense_growth: { value: null, unit: "%", confidence: "High" },
    };
    const r2 = injectDeterministicRisks(a, [], "");
    expect(r2.injectedTypes.has("ExpenseUnderstated")).toBe(false);
  });
});

/* ================================================================
 * Full integration / determinism
 * ================================================================ */
describe("full determinism integration", () => {
  const assumptions: DealScanAssumptions = {
    ltv: { value: 68, unit: "%", confidence: "High" },
    debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    vacancy: { value: 7, unit: "%", confidence: "High" },
    rent_growth: { value: 3.5, unit: "%", confidence: "High" },
    expense_growth: { value: 2.8, unit: "%", confidence: "High" },
    exit_cap: { value: 6.1, unit: "%", confidence: "High" },
    cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    hold_period_years: { value: 5, unit: "years", confidence: "High" },
  };
  const dealText = "The property is undergoing a $2M renovation with 10 offline units";

  it("produces identical output across 20 runs with empty AI risks", () => {
    const results: string[][] = [];
    for (let i = 0; i < 20; i++) {
      const r = injectDeterministicRisks(assumptions, [], dealText);
      results.push(
        r.risks.map((x) => `${x.risk_type}:${x.severity}`).sort()
      );
    }
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
  });

  it("injects expected risks for the reference building", () => {
    const r = injectDeterministicRisks(assumptions, [], dealText);
    const types = [...r.injectedTypes].sort();
    expect(types).toEqual([
      "ConstructionTimingRisk",
      "DebtCostRisk",
      "ExitCapCompression",
      "ExpenseUnderstated",
      "RefiRisk",
      "RentGrowthAggressive",
      "VacancyUnderstated",
    ]);
  });

  it("skips AI-extracted risks but injects the rest consistently", () => {
    const aiRisks = [makeAiRisk("DebtCostRisk"), makeAiRisk("RentGrowthAggressive")];
    const r = injectDeterministicRisks(assumptions, aiRisks, dealText);

    expect(r.injectedTypes.has("DebtCostRisk")).toBe(false);
    expect(r.injectedTypes.has("RentGrowthAggressive")).toBe(false);

    const injected = [...r.injectedTypes].sort();
    expect(injected).toEqual([
      "ConstructionTimingRisk",
      "ExitCapCompression",
      "ExpenseUnderstated",
      "RefiRisk",
      "VacancyUnderstated",
    ]);

    // AI risks preserved unchanged
    expect(r.risks.filter((x) => x.what_changed_or_trigger === "AI trigger")).toHaveLength(2);
  });
});

/* ================================================================
 * Edge cases
 * ================================================================ */
describe("edge cases", () => {
  it("handles all assumptions missing (no injections except text-based)", () => {
    const r = injectDeterministicRisks({}, [], "no keywords here");
    expect(r.risks).toHaveLength(0);
    expect(r.injectedTypes.size).toBe(0);
  });

  it("handles null values in assumption cells", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: null, unit: "%", confidence: "High" },
      rent_growth: { value: null, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    expect(r.injectedTypes.size).toBe(0);
  });

  it("all injected risks have confidence High", () => {
    const a: DealScanAssumptions = {
      debt_rate: { value: 7.5, unit: "%", confidence: "High" },
      rent_growth: { value: 4.0, unit: "%", confidence: "High" },
      expense_growth: { value: 2.0, unit: "%", confidence: "High" },
    };
    const r = injectDeterministicRisks(a, [], "");
    for (const risk of r.risks) {
      if (r.injectedTypes.has(risk.risk_type as DealScanRisk["risk_type"])) {
        expect(risk.confidence).toBe("High");
      }
    }
  });
});
