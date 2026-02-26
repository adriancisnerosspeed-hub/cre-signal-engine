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

  it("fallback: returns aiSeverity when no rule or missing data", () => {
    expect(applySeverityOverride("InsuranceRisk", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("High");
  });
});
