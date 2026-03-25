import { describe, it, expect } from "vitest";
import {
  applySeverityOverride,
  shouldRemoveDataMissing,
  shouldRemoveExitCapCompression,
  shouldRemoveExpenseUnderstated,
} from "./riskSeverityOverrides";
import type { DealScanAssumptions } from "./dealScanContract";

describe("applySeverityOverride", () => {
  /* ================================================================
   * DebtCostRisk — LTV-primary, debt_rate secondary
   * ================================================================ */
  it("DebtCostRisk: uses AI severity when no LTV", () => {
    expect(applySeverityOverride("DebtCostRisk", "High", undefined)).toBe("High");
    expect(applySeverityOverride("DebtCostRisk", "Medium", {})).toBe("Medium");
  });

  it("DebtCostRisk: deterministic from LTV + debt_rate", () => {
    // High: LTV >= 80
    expect(applySeverityOverride("DebtCostRisk", "Low", {
      ltv: { value: 82, unit: "%", confidence: "High" },
    })).toBe("High");
    // Medium: LTV >= 75
    expect(applySeverityOverride("DebtCostRisk", "Low", {
      ltv: { value: 76, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Medium: LTV >= 65 AND debt_rate > 6.5
    expect(applySeverityOverride("DebtCostRisk", "Low", {
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Low: LTV >= 60 AND debt_rate >= 6.0
    expect(applySeverityOverride("DebtCostRisk", "High", {
      ltv: { value: 62, unit: "%", confidence: "High" },
      debt_rate: { value: 6.0, unit: "%", confidence: "High" },
    })).toBe("Low");
    // Fallback: LTV 55 → AI severity
    expect(applySeverityOverride("DebtCostRisk", "High", {
      ltv: { value: 55, unit: "%", confidence: "High" },
      debt_rate: { value: 7.0, unit: "%", confidence: "High" },
    })).toBe("High");
    // LTV >= 65 but debt_rate <= 6.5 → AI severity (no Medium match)
    expect(applySeverityOverride("DebtCostRisk", "Low", {
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.0, unit: "%", confidence: "High" },
    })).toBe("Low"); // LTV >= 60 AND debt_rate >= 6.0 → Low
  });

  /* ================================================================
   * RefiRisk — LTV + hold + debt_rate, with debt_rate-only fallback
   * ================================================================ */
  it("RefiRisk: uses AI severity when no LTV and no debt_rate", () => {
    expect(applySeverityOverride("RefiRisk", "High", undefined)).toBe("High");
    expect(applySeverityOverride("RefiRisk", "Medium", {})).toBe("Medium");
  });

  it("RefiRisk: deterministic from LTV + hold + debt_rate", () => {
    // High: LTV >= 75 AND hold <= 3
    expect(applySeverityOverride("RefiRisk", "Low", {
      ltv: { value: 78, unit: "%", confidence: "High" },
      hold_period_years: { value: 2, unit: "years", confidence: "High" },
    })).toBe("High");
    // Medium: LTV >= 70 AND hold <= 5 AND debt_rate >= 6.5
    expect(applySeverityOverride("RefiRisk", "Low", {
      ltv: { value: 72, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Low: LTV >= 70 AND hold <= 5 AND debt_rate < 6.5
    expect(applySeverityOverride("RefiRisk", "High", {
      ltv: { value: 72, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
      debt_rate: { value: 6.0, unit: "%", confidence: "High" },
    })).toBe("Low");
    // Low: LTV >= 70 AND hold <= 5 AND no debt_rate → debt_rate < 6.5 path
    expect(applySeverityOverride("RefiRisk", "High", {
      ltv: { value: 72, unit: "%", confidence: "High" },
      hold_period_years: { value: 4, unit: "years", confidence: "High" },
    })).toBe("Low");
  });

  it("RefiRisk: debt_rate-only fallback when LTV < 70", () => {
    // Fallback: LTV < 70 but debt_rate >= 6.5 AND hold <= 5 → Medium
    expect(applySeverityOverride("RefiRisk", "Low", {
      ltv: { value: 68, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Fallback: no LTV but debt_rate >= 6.5 AND hold <= 5 → Medium
    expect(applySeverityOverride("RefiRisk", "Low", {
      hold_period_years: { value: 3, unit: "years", confidence: "High" },
      debt_rate: { value: 7.0, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // No fallback: debt_rate < 6.5 → AI severity
    expect(applySeverityOverride("RefiRisk", "High", {
      ltv: { value: 68, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
      debt_rate: { value: 6.0, unit: "%", confidence: "High" },
    })).toBe("High");
  });

  /* ================================================================
   * VacancyUnderstated — construction keywords bump UP
   * ================================================================ */
  it("VacancyUnderstated: deterministic from vacancy", () => {
    // High: >= 15
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 18, unit: "%", confidence: "High" },
    })).toBe("High");
    // Medium: >= 10
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 12, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Low: >= 5 without construction keywords
    expect(applySeverityOverride("VacancyUnderstated", "High", {
      vacancy: { value: 7, unit: "%", confidence: "High" },
    })).toBe("Low");
    // Below 5: AI severity
    expect(applySeverityOverride("VacancyUnderstated", "High", {
      vacancy: { value: 3, unit: "%", confidence: "High" },
    })).toBe("High");
    // No data: AI severity
    expect(applySeverityOverride("VacancyUnderstated", "Medium", {})).toBe("Medium");
  });

  it("VacancyUnderstated: construction keywords bump severity to Medium", () => {
    // 7% with construction → Medium (bumped from Low)
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 7, unit: "%", confidence: "High" },
    }, { hasConstructionKeywords: true })).toBe("Medium");
    // 5% with construction → Medium (bumped from Low)
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 5, unit: "%", confidence: "High" },
    }, { hasConstructionKeywords: true })).toBe("Medium");
    // >= 10 with construction stays Medium (no double-bump)
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 12, unit: "%", confidence: "High" },
    }, { hasConstructionKeywords: true })).toBe("Medium");
    // >= 15 with construction stays High
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 18, unit: "%", confidence: "High" },
    }, { hasConstructionKeywords: true })).toBe("High");
    // < 5 with construction → AI severity (not enough vacancy to trigger)
    expect(applySeverityOverride("VacancyUnderstated", "Low", {
      vacancy: { value: 3, unit: "%", confidence: "High" },
    }, { hasConstructionKeywords: true })).toBe("Low");
  });

  /* ================================================================
   * RentGrowthAggressive — shifted thresholds
   * ================================================================ */
  it("RentGrowthAggressive: deterministic from rent_growth", () => {
    const h: DealScanAssumptions = { rent_growth: { value: 9.0, unit: "%", confidence: "High" } };
    const m: DealScanAssumptions = { rent_growth: { value: 5.5, unit: "%", confidence: "Medium" } };
    const l: DealScanAssumptions = { rent_growth: { value: 3.5, unit: "%", confidence: "Low" } };
    const below: DealScanAssumptions = { rent_growth: { value: 2.5, unit: "%", confidence: "Low" } };
    expect(applySeverityOverride("RentGrowthAggressive", "Low", h)).toBe("High");    // >= 8.0
    expect(applySeverityOverride("RentGrowthAggressive", "High", m)).toBe("Medium");  // >= 5.0
    expect(applySeverityOverride("RentGrowthAggressive", "High", l)).toBe("Low");     // >= 3.0
    expect(applySeverityOverride("RentGrowthAggressive", "High", below)).toBe("High"); // < 3.0 → aiSeverity
  });

  it("RentGrowthAggressive: uses AI severity when no rent_growth", () => {
    expect(applySeverityOverride("RentGrowthAggressive", "High", undefined)).toBe("High");
    expect(applySeverityOverride("RentGrowthAggressive", "Medium", {})).toBe("Medium");
  });

  /* ================================================================
   * ExitCapCompression — spread-based with removal for > 0.5
   * ================================================================ */
  it("ExitCapCompression: deterministic from spread", () => {
    // High: exit_cap < cap_rate_in by >= 0.5 (spread <= -0.5)
    expect(applySeverityOverride("ExitCapCompression", "Low", {
      exit_cap: { value: 5.0, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    })).toBe("High");
    // Medium: exit_cap <= cap_rate_in (spread <= 0, > -0.5)
    expect(applySeverityOverride("ExitCapCompression", "Low", {
      exit_cap: { value: 5.4, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // Low: exit_cap > cap_rate_in by <= 0.5 (spread <= 0.5)
    expect(applySeverityOverride("ExitCapCompression", "Low", {
      exit_cap: { value: 6.1, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
    })).toBe("Low");
    // Spread > 0.5 → aiSeverity (removal handled separately)
    expect(applySeverityOverride("ExitCapCompression", "High", {
      exit_cap: { value: 6.5, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    })).toBe("High");
  });

  /* ================================================================
   * ExpenseUnderstated — missing data path + removal for >= 3.0
   * ================================================================ */
  it("ExpenseUnderstated: deterministic from expense_growth", () => {
    expect(applySeverityOverride("ExpenseUnderstated", "High", {
      expense_growth: { value: 1.5, unit: "%", confidence: "High" },
    })).toBe("Medium");  // < 2.0
    expect(applySeverityOverride("ExpenseUnderstated", "High", {
      expense_growth: { value: 2.8, unit: "%", confidence: "Medium" },
    })).toBe("Low");     // >= 2.0 AND < 3.0
    // >= 3.0 → aiSeverity (removal handled separately)
    expect(applySeverityOverride("ExpenseUnderstated", "High", {
      expense_growth: { value: 3.5, unit: "%", confidence: "Low" },
    })).toBe("High");
  });

  it("ExpenseUnderstated: missing expense_growth with NOI present → Medium", () => {
    expect(applySeverityOverride("ExpenseUnderstated", "Low", {
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
    })).toBe("Medium");
  });

  it("ExpenseUnderstated: missing expense_growth without NOI → AI severity", () => {
    expect(applySeverityOverride("ExpenseUnderstated", "High", {})).toBe("High");
  });

  /* ================================================================
   * MarketLiquidityRisk — unchanged
   * ================================================================ */
  it("MarketLiquidityRisk: deterministic from LTV", () => {
    expect(applySeverityOverride("MarketLiquidityRisk", "Low", {
      ltv: { value: 82, unit: "%", confidence: "High" },
    })).toBe("High");
    expect(applySeverityOverride("MarketLiquidityRisk", "High", {
      ltv: { value: 72, unit: "%", confidence: "Medium" },
    })).toBe("Medium");
    expect(applySeverityOverride("MarketLiquidityRisk", "High", {
      ltv: { value: 60, unit: "%", confidence: "Low" },
    })).toBe("Low");
  });

  /* ================================================================
   * InsuranceRisk / ConstructionTimingRisk — always Medium
   * ================================================================ */
  it("InsuranceRisk: always Medium", () => {
    expect(applySeverityOverride("InsuranceRisk", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("Medium");
    expect(applySeverityOverride("InsuranceRisk", "Low", undefined)).toBe("Medium");
  });

  it("ConstructionTimingRisk: always Medium", () => {
    expect(applySeverityOverride("ConstructionTimingRisk", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("Medium");
    expect(applySeverityOverride("ConstructionTimingRisk", "Low", {})).toBe("Medium");
    expect(applySeverityOverride("ConstructionTimingRisk", "High", undefined)).toBe("Medium");
  });

  /* ================================================================
   * DataMissing — count-based (6 critical keys)
   * ================================================================ */
  it("DataMissing: deterministic from critical assumption count", () => {
    // 0 present = 6 missing → High
    expect(applySeverityOverride("DataMissing", "Low", {})).toBe("High");
    // 4 present = 2 missing → Medium
    expect(applySeverityOverride("DataMissing", "Low", {
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      ltv: { value: 70, unit: "%", confidence: "High" },
      vacancy: { value: 10, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5, unit: "%", confidence: "High" },
    })).toBe("Medium");
    // All 6 present = 0 missing → AI severity (removal handled by shouldRemoveDataMissing)
    expect(applySeverityOverride("DataMissing", "Low", {
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      ltv: { value: 70, unit: "%", confidence: "High" },
      vacancy: { value: 10, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5, unit: "%", confidence: "High" },
      debt_rate: { value: 6, unit: "%", confidence: "High" },
      exit_cap: { value: 6.5, unit: "%", confidence: "High" },
    })).toBe("Low");
    // 3 present = 3 missing → High
    expect(applySeverityOverride("DataMissing", "Low", {
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      ltv: { value: 70, unit: "%", confidence: "High" },
      vacancy: { value: 10, unit: "%", confidence: "High" },
    })).toBe("High");
  });

  /* ================================================================
   * Fallback: unknown risk types
   * ================================================================ */
  it("fallback: returns aiSeverity for RegulatoryPolicyExposure (no numeric proxy)", () => {
    expect(applySeverityOverride("RegulatoryPolicyExposure", "High", { ltv: { value: 70, unit: "%", confidence: "High" } })).toBe("High");
    expect(applySeverityOverride("RegulatoryPolicyExposure", "Low", {})).toBe("Low");
  });

  /* ================================================================
   * Reference building: deterministic regardless of AI severity
   * ================================================================ */
  it("reference building: severity overrides are deterministic regardless of AI severity", () => {
    const assumptions: DealScanAssumptions = {
      purchase_price: { value: 12_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 660_000, unit: "USD", confidence: "High" },
      cap_rate_in: { value: 5.6, unit: "%", confidence: "High" },
      exit_cap: { value: 6.1, unit: "%", confidence: "High" },
      vacancy: { value: 7, unit: "%", confidence: "High" },
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
      rent_growth: { value: 3.5, unit: "%", confidence: "High" },
      hold_period_years: { value: 5, unit: "years", confidence: "High" },
      expense_growth: { value: 2.8, unit: "%", confidence: "High" },
    };
    const context = { hasConstructionKeywords: true }; // renovation text
    const severities = ["Low", "Medium", "High"];
    for (let i = 0; i < 20; i++) {
      const aiSev = severities[i % 3];
      expect(applySeverityOverride("DebtCostRisk", aiSev, assumptions)).toBe("Medium");
      expect(applySeverityOverride("RefiRisk", aiSev, assumptions)).toBe("Medium");
      expect(applySeverityOverride("VacancyUnderstated", aiSev, assumptions, context)).toBe("Medium");
      expect(applySeverityOverride("RentGrowthAggressive", aiSev, assumptions)).toBe("Low");
      expect(applySeverityOverride("ExitCapCompression", aiSev, assumptions)).toBe("Low");
      expect(applySeverityOverride("ExpenseUnderstated", aiSev, assumptions)).toBe("Low");
      expect(applySeverityOverride("ConstructionTimingRisk", aiSev, assumptions)).toBe("Medium");
      expect(applySeverityOverride("InsuranceRisk", aiSev, assumptions)).toBe("Medium");
    }
  });
});

/* ================================================================
 * shouldRemoveDataMissing
 * ================================================================ */
describe("shouldRemoveDataMissing", () => {
  it("returns true when all 8 core assumptions have High confidence", () => {
    const full: DealScanAssumptions = {
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 6.0, unit: "%", confidence: "High" },
      vacancy: { value: 7, unit: "%", confidence: "High" },
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
      rent_growth: { value: 3.5, unit: "%", confidence: "High" },
    };
    expect(shouldRemoveDataMissing(full)).toBe(true);
  });

  it("returns false when any core assumption has non-High confidence", () => {
    const mixed: DealScanAssumptions = {
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "Medium" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 6.0, unit: "%", confidence: "High" },
      vacancy: { value: 7, unit: "%", confidence: "High" },
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
      rent_growth: { value: 3.5, unit: "%", confidence: "High" },
    };
    expect(shouldRemoveDataMissing(mixed)).toBe(false);
  });

  it("returns false when any core assumption is missing", () => {
    const partial: DealScanAssumptions = {
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    };
    expect(shouldRemoveDataMissing(partial)).toBe(false);
  });

  it("returns false for undefined assumptions", () => {
    expect(shouldRemoveDataMissing(undefined)).toBe(false);
  });

  it("returns false when a core assumption has null value", () => {
    const withNull: DealScanAssumptions = {
      purchase_price: { value: null, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
      exit_cap: { value: 6.0, unit: "%", confidence: "High" },
      vacancy: { value: 7, unit: "%", confidence: "High" },
      ltv: { value: 68, unit: "%", confidence: "High" },
      debt_rate: { value: 6.85, unit: "%", confidence: "High" },
      rent_growth: { value: 3.5, unit: "%", confidence: "High" },
    };
    expect(shouldRemoveDataMissing(withNull)).toBe(false);
  });
});

/* ================================================================
 * shouldRemoveExitCapCompression
 * ================================================================ */
describe("shouldRemoveExitCapCompression", () => {
  it("returns true when exit_cap > cap_rate_in by > 0.5", () => {
    expect(shouldRemoveExitCapCompression({
      exit_cap: { value: 6.5, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    })).toBe(true);
  });

  it("returns false when spread <= 0.5", () => {
    expect(shouldRemoveExitCapCompression({
      exit_cap: { value: 6.0, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    })).toBe(false);
    expect(shouldRemoveExitCapCompression({
      exit_cap: { value: 5.3, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    })).toBe(false);
  });

  it("returns false when either cap is null", () => {
    expect(shouldRemoveExitCapCompression({
      exit_cap: { value: 6.5, unit: "%", confidence: "High" },
    })).toBe(false);
    expect(shouldRemoveExitCapCompression({
      cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
    })).toBe(false);
  });

  it("returns false for undefined assumptions", () => {
    expect(shouldRemoveExitCapCompression(undefined)).toBe(false);
  });
});

/* ================================================================
 * shouldRemoveExpenseUnderstated
 * ================================================================ */
describe("shouldRemoveExpenseUnderstated", () => {
  it("returns true when expense_growth >= 3.0", () => {
    expect(shouldRemoveExpenseUnderstated({
      expense_growth: { value: 3.0, unit: "%", confidence: "High" },
    })).toBe(true);
    expect(shouldRemoveExpenseUnderstated({
      expense_growth: { value: 4.5, unit: "%", confidence: "High" },
    })).toBe(true);
  });

  it("returns false when expense_growth < 3.0", () => {
    expect(shouldRemoveExpenseUnderstated({
      expense_growth: { value: 2.8, unit: "%", confidence: "High" },
    })).toBe(false);
    expect(shouldRemoveExpenseUnderstated({
      expense_growth: { value: 1.0, unit: "%", confidence: "High" },
    })).toBe(false);
  });

  it("returns false when expense_growth is missing", () => {
    expect(shouldRemoveExpenseUnderstated({})).toBe(false);
  });

  it("returns false for undefined assumptions", () => {
    expect(shouldRemoveExpenseUnderstated(undefined)).toBe(false);
  });
});
