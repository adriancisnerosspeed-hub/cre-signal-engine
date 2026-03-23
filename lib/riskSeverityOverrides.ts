/**
 * Deterministic severity overrides applied AFTER AI extraction, BEFORE scoring.
 * Reduces drift across runs when numeric assumptions exist.
 * v3: expanded to cover all risk types with numeric proxies.
 */

import type { DealScanAssumptions } from "./dealScanContract";
import { computeAssumptionCompleteness } from "./assumptionValidation";

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
  assumptions: DealScanAssumptions | undefined
): string {
  const ltv = getValue(assumptions, "ltv");
  const rentGrowth = getValue(assumptions, "rent_growth");
  const vacancy = getValue(assumptions, "vacancy");
  const exitCap = getValue(assumptions, "exit_cap");
  const capRateIn = getValue(assumptions, "cap_rate_in");

  switch (riskType) {
    case "RentGrowthAggressive":
      if (rentGrowth != null) {
        if (rentGrowth >= 4) return "High";
        if (rentGrowth >= 3) return "Medium";
        return "Low";
      }
      break;

    case "VacancyUnderstated":
      if (vacancy != null) {
        if (vacancy >= 20) return "High";
        if (vacancy >= 10) return "Medium";
        return "Low";
      }
      break;

    case "DebtCostRisk":
    case "RefiRisk":
      if (ltv != null) {
        if (ltv >= 75) return "High";
        if (ltv >= 65) return "Medium";
        return "Low";
      }
      break;

    case "ExitCapCompression":
      if (exitCap != null && capRateIn != null) {
        const spread = capRateIn - exitCap;
        if (spread > 0.5) return "High";
        if (spread > 0.25) return "Medium";
        return "Low";
      }
      break;

    case "ExpenseUnderstated": {
      const expenseGrowth = getValue(assumptions, "expense_growth");
      if (expenseGrowth != null) {
        if (expenseGrowth >= 5) return "High";
        if (expenseGrowth >= 3) return "Medium";
        return "Low";
      }
      break;
    }

    case "MarketLiquidityRisk":
      if (ltv != null) {
        if (ltv >= 80) return "High";
        if (ltv >= 70) return "Medium";
        return "Low";
      }
      break;

    case "InsuranceRisk":
      return "Medium";

    case "DataMissing": {
      const { pct } = computeAssumptionCompleteness(assumptions);
      if (pct < 40) return "High";
      if (pct < 70) return "Medium";
      return "Low";
    }
  }

  return aiSeverity; // fallback if no deterministic rule
}
