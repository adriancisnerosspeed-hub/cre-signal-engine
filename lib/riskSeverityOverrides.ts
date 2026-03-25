/**
 * Deterministic severity overrides applied AFTER AI extraction, BEFORE scoring.
 * Reduces drift across runs when numeric assumptions exist.
 * v3.1: revised thresholds — LTV-primary DebtCost/Refi, construction-context
 *       vacancy bump, count-based DataMissing, removal signals for ExitCap/Expense.
 */

import type { DealScanAssumptions } from "./dealScanContract";

function getValue(
  assumptions: DealScanAssumptions | undefined,
  key: keyof DealScanAssumptions
): number | null {
  const cell = assumptions?.[key];
  if (!cell || typeof cell !== "object") return null;
  const v = (cell as { value?: number | null }).value;
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function applySeverityOverride(
  riskType: string,
  aiSeverity: string,
  assumptions: DealScanAssumptions | undefined,
  context?: { hasConstructionKeywords?: boolean }
): string {
  const ltv = getValue(assumptions, "ltv");
  const rentGrowth = getValue(assumptions, "rent_growth");
  const vacancy = getValue(assumptions, "vacancy");
  const exitCap = getValue(assumptions, "exit_cap");
  const capRateIn = getValue(assumptions, "cap_rate_in");
  const debtRate = getValue(assumptions, "debt_rate");
  const holdPeriodYears = getValue(assumptions, "hold_period_years");
  const expenseGrowth = getValue(assumptions, "expense_growth");
  const noiYear1 = getValue(assumptions, "noi_year1");

  switch (riskType) {
    case "DebtCostRisk":
      if (ltv != null) {
        if (ltv >= 80) return "High";
        if (ltv >= 75) return "Medium";
        if (ltv >= 65 && debtRate != null && debtRate > 6.5) return "Medium";
        if (ltv >= 60 && debtRate != null && debtRate >= 6.0) return "Low";
        return "Low"; // LTV present but below all thresholds → Low floor
      }
      break;

    case "RefiRisk":
      if (ltv != null && holdPeriodYears != null && debtRate != null) {
        if (ltv >= 75 && holdPeriodYears <= 3) return "High";
        if (ltv >= 70 && holdPeriodYears <= 5 && debtRate >= 6.5) return "Medium";
        if (ltv < 70 && debtRate >= 6.5 && holdPeriodYears <= 5) return "Medium";
        return "Low"; // all three values present but below all thresholds → Low floor
      }
      // Partial data: LTV + hold without debt_rate
      if (ltv != null && holdPeriodYears != null) {
        if (ltv >= 75 && holdPeriodYears <= 3) return "High";
        if (ltv >= 70 && holdPeriodYears <= 5) return "Low";
        return "Low";
      }
      // Partial data: debt_rate + hold without LTV
      if (debtRate != null && holdPeriodYears != null) {
        if (debtRate >= 6.5 && holdPeriodYears <= 5) return "Medium";
        return "Low";
      }
      break;

    case "VacancyUnderstated":
      if (vacancy != null) {
        if (vacancy >= 15) return "High";
        if (vacancy >= 10) return "Medium";
        if (vacancy >= 5 && context?.hasConstructionKeywords) return "Medium"; // construction bumps up
        if (vacancy >= 5) return "Low";
        return "Low"; // vacancy present but < 5 → Low floor
      }
      break;

    case "RentGrowthAggressive":
      if (rentGrowth != null) {
        if (rentGrowth >= 8.0) return "High";
        if (rentGrowth >= 5.0) return "Medium";
        return "Low"; // rent_growth present → Low floor (< 5% is not aggressive)
      }
      break;

    case "ExitCapCompression":
      if (exitCap != null && capRateIn != null) {
        const spread = exitCap - capRateIn;
        if (spread <= -0.5) return "High";
        if (spread <= 0) return "Medium";
        if (spread <= 0.5) return "Low";
        return "Low"; // spread > 0.5 → should be removed, but if still present force Low (never AI)
      }
      break;

    case "ExpenseUnderstated":
      // Missing expense_growth but NOI present → uncertain expense assumptions
      if (expenseGrowth == null && noiYear1 != null) return "Medium";
      if (expenseGrowth != null) {
        if (expenseGrowth < 2.0) return "Medium";
        if (expenseGrowth < 3.0) return "Low";
        return "Low"; // >= 3.0 → should be removed, but if still present force Low (never AI)
      }
      break;

    case "MarketLiquidityRisk":
      if (ltv != null) {
        if (ltv >= 80) return "High";
        if (ltv >= 70) return "Medium";
        return "Low";
      }
      break;

    case "InsuranceRisk":
      return "Medium";

    case "ConstructionTimingRisk":
      return "Medium";

    case "DataMissing": {
      const CRITICAL_KEYS: (keyof DealScanAssumptions)[] = [
        "noi_year1", "ltv", "vacancy", "debt_rate", "cap_rate_in", "exit_cap",
      ];
      const missingCount = CRITICAL_KEYS.filter(
        (k) => getValue(assumptions, k) == null
      ).length;
      if (missingCount >= 3) return "High";
      if (missingCount >= 1) return "Medium";
      // 0 missing → removal handled by shouldRemoveDataMissing
      break;
    }
  }

  return aiSeverity; // fallback if no deterministic rule
}

/* ---------- DataMissing removal ---------- */

const DATA_MISSING_CORE_KEYS: (keyof DealScanAssumptions)[] = [
  "purchase_price",
  "noi_year1",
  "cap_rate_in",
  "exit_cap",
  "vacancy",
  "ltv",
  "debt_rate",
  "rent_growth",
];

/**
 * Returns true if all 8 core assumptions have a non-null numeric value
 * AND High confidence — meaning DataMissing should be removed from the
 * risk list (the data is complete and trustworthy).
 */
export function shouldRemoveDataMissing(
  assumptions: DealScanAssumptions | undefined
): boolean {
  if (!assumptions) return false;
  return DATA_MISSING_CORE_KEYS.every((key) => {
    const cell = assumptions[key];
    if (!cell || typeof cell !== "object") return false;
    return (
      cell.value != null &&
      typeof cell.value === "number" &&
      !Number.isNaN(cell.value) &&
      cell.confidence === "High"
    );
  });
}

/* ---------- ExitCapCompression removal ---------- */

/**
 * Returns true when exit_cap > cap_rate_in by more than 0.5% — a conservative
 * exit assumption is not a compression risk and should be removed.
 */
export function shouldRemoveExitCapCompression(
  assumptions: DealScanAssumptions | undefined
): boolean {
  const exitCap = getValue(assumptions, "exit_cap");
  const capRateIn = getValue(assumptions, "cap_rate_in");
  if (exitCap == null || capRateIn == null) return false;
  return exitCap - capRateIn > 0.5;
}

/* ---------- ExpenseUnderstated removal ---------- */

/**
 * Returns true when expense_growth >= 3.0% — reasonable expense growth
 * assumptions are not a risk.
 */
export function shouldRemoveExpenseUnderstated(
  assumptions: DealScanAssumptions | undefined
): boolean {
  const expenseGrowth = getValue(assumptions, "expense_growth");
  return expenseGrowth != null && expenseGrowth >= 3.0;
}
