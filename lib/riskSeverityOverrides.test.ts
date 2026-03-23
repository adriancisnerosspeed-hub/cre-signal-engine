import { describe, it, expect } from "vitest";
import { applySeverityOverride } from "./riskSeverityOverrides";
import type { DealScanAssumptions } from "./dealScanContract";

describe("applySeverityOverride", () => {
  it("RentGrowthAggressive: uses AI severity when no rent_growth", () => {
    expect(applySeverityOverride("RentGrowthAggressive", "High", undefined)).toBe("High");
    expect(applySeverityOverride("RentGrowthAggressive", "Medium", {})).toBe("Medium");
  });

  it("RentGrowthAggressive: deterministic from rent_growth", () => {
    const a: DealScanAssumptions = { rent_growth: { value: 4.5, unit: "%", confidence: "High" } };
    const b: DealScanAssumptions = { rent_growth: { value: 3.2, unit: "%", confidence: "Medium" } };
    const c: DealScanAssumptions = { rent_growth: { value: 2, unit: "%", confidence: "Low" } };
    expect(applySeverityOverride("RentGrowthAggressive", "Low", a)).toBe("High");
    expect(applySeverityOverride("RentGrowthAggressive", "High", b)).toBe("Medium");
    expect(applySeverityOverride("RentGrowthAggressive", "High", c)).toBe("Low");
  });

  it("VacancyUnderstated: deterministic from vacancy", () => {
    expect(applySeverityOverride("VacancyUnderstated", "Low", { vacancy: { value: 22, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("VacancyUnderstated", "High", { vacancy: { value: 12, unit: "%", confidence: "Low" } })).toBe("Medium");
    expect(applySeverityOverride("VacancyUnderstated", "High", { vacancy: { value: 5, unit: "%", confidence: "Low" } })).toBe("Low");
  });

  it("DebtCostRisk/RefiRisk: deterministic from ltv", () => {
    expect(applySeverityOverride("RefiRisk", "Low", { ltv: { value: 78, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("DebtCostRisk", "High", { ltv: { value: 67, unit: "%", confidence: "Medium" } })).toBe("Medium");
    expect(applySeverityOverride("RefiRisk", "High", { ltv: { value: 60, unit: "%", confidence: "Low" } })).toBe("Low");
  });

  it("ExitCapCompression: deterministic from cap spread", () => {
    const assumptions: DealScanAssumptions = {
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 4.8, unit: "%", confidence: "High" },
    };
    expect(applySeverityOverride("ExitCapCompression", "Low", assumptions)).toBe("High"); // spread 0.7 > 0.5
    const m: DealScanAssumptions = { cap_rate_in: { value: 5.5, unit: "%", confidence: "High" }, exit_cap: { value: 5.2, unit: "%", confidence: "High" } };
    expect(applySeverityOverride("ExitCapCompression", "Low", m)).toBe("Medium"); // spread 0.3
    const l: DealScanAssumptions = { cap_rate_in: { value: 5.5, unit: "%", confidence: "High" }, exit_cap: { value: 5.4, unit: "%", confidence: "High" } };
    expect(applySeverityOverride("ExitCapCompression", "High", l)).toBe("Low"); // spread 0.1
  });

  it("ExpenseUnderstated: deterministic from expense_growth", () => {
    expect(applySeverityOverride("ExpenseUnderstated", "Low", { expense_growth: { value: 6, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("ExpenseUnderstated", "High", { expense_growth: { value: 3.5, unit: "%", confidence: "Medium" } })).toBe("Medium");
    expect(applySeverityOverride("ExpenseUnderstated", "High", { expense_growth: { value: 2, unit: "%", confidence: "Low" } })).toBe("Low");
    // Fallback when no expense_growth
    expect(applySeverityOverride("ExpenseUnderstated", "High", {})).toBe("High");
  });

  it("MarketLiquidityRisk: deterministic from LTV", () => {
    expect(applySeverityOverride("MarketLiquidityRisk", "Low", { ltv: { value: 82, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("MarketLiquidityRisk", "High", { ltv: { value: 72, unit: "%", confidence: "Medium" } })).toBe("Medium");
    expect(applySeverityOverride("MarketLiquidityRisk", "High", { ltv: { value: 60, unit: "%", confidence: "Low" } })).toBe("Low");
  });

  it("InsuranceRisk: always Medium", () => {
    expect(applySeverityOverride("InsuranceRisk", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("Medium");
    expect(applySeverityOverride("InsuranceRisk", "Low", undefined)).toBe("Medium");
  });

  it("DataMissing: deterministic from assumption completeness", () => {
    // Empty assumptions → 0% completeness → High
    expect(applySeverityOverride("DataMissing", "Low", {})).toBe("High");
    // 5 of 8 present → 63% → Medium
    const partial = {
      cap_rate_in: { value: 5, unit: "%", confidence: "High" as const },
      exit_cap: { value: 6, unit: "%", confidence: "High" as const },
      noi_year1: { value: 500000, unit: "USD", confidence: "High" as const },
      ltv: { value: 70, unit: "%", confidence: "High" as const },
      vacancy: { value: 10, unit: "%", confidence: "High" as const },
    };
    expect(applySeverityOverride("DataMissing", "High", partial)).toBe("Medium");
    // All 8 present → 100% → Low
    const full = {
      ...partial,
      debt_rate: { value: 5, unit: "%", confidence: "High" as const },
      expense_growth: { value: 3, unit: "%", confidence: "High" as const },
      rent_growth: { value: 3, unit: "%", confidence: "High" as const },
    };
    expect(applySeverityOverride("DataMissing", "High", full)).toBe("Low");
  });

  it("fallback: returns aiSeverity for ConstructionTimingRisk (no numeric proxy)", () => {
    expect(applySeverityOverride("ConstructionTimingRisk", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("ConstructionTimingRisk", "Low", {})).toBe("Low");
  });
});
