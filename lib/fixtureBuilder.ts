/**
 * QA fixture builder: programmatic extraction (assumptions + risks) for demo-grade stress cases.
 * Used by internal fixtures API only. Pure logic — no DB or I/O.
 */

import type { DealScanNormalized } from "./dealScanContract";

export type FixtureType =
  | "UNIT_INFERENCE"
  | "EXTREME_LEVERAGE"
  | "VERSION_DRIFT"
  | "DRIVER_CAP"
  | "DETERIORATION";

/** Single scenario: assumptions + risks in scan extraction shape. */
export type FixtureScenario = {
  assumptions: DealScanNormalized["assumptions"];
  risks: DealScanNormalized["risks"];
};

/**
 * Returns one or two scenarios per fixture type.
 * UNIT_INFERENCE: vacancy=0.38, ltv=0.92 with unit null (triggers unit inference).
 * EXTREME_LEVERAGE: ltv=92%, vacancy=35%, exit cap compression 1.2%.
 * VERSION_DRIFT: two scenarios (first will be stored with fake version "1.9", second current).
 * DRIVER_CAP: scenario where one driver > 40% before cap (high leverage + few others).
 * DETERIORATION: first moderate, second with delta >= 10.
 */
export function buildFixtureScenarios(type: FixtureType): FixtureScenario[] {
  const baseRisk = {
    what_changed_or_trigger: "Fixture",
    why_it_matters: "",
    who_this_affects: "",
    recommended_action: "Monitor" as const,
    evidence_snippets: [] as string[],
  };

  switch (type) {
    case "UNIT_INFERENCE": {
      return [
        {
          assumptions: {
            vacancy: { value: 0.38, unit: null, confidence: "High" },
            ltv: { value: 0.92, unit: null, confidence: "Medium" },
            cap_rate_in: { value: 5.5, unit: "%", confidence: "High" },
            purchase_price: { value: 10_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 500_000, unit: null, confidence: "Medium" },
            debt_rate: { value: 5.5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "VacancyUnderstated", severity: "Medium", confidence: "High" },
          ],
        },
      ];
    }

    case "EXTREME_LEVERAGE": {
      const capIn = 5.5;
      const exitCap = capIn - 1.2;
      return [
        {
          assumptions: {
            ltv: { value: 92, unit: "%", confidence: "High" },
            vacancy: { value: 35, unit: "%", confidence: "High" },
            cap_rate_in: { value: capIn, unit: "%", confidence: "High" },
            exit_cap: { value: exitCap, unit: "%", confidence: "High" },
            purchase_price: { value: 15_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 825_000, unit: null, confidence: "Medium" },
            debt_rate: { value: 5.5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "RefiRisk", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "ExitCapCompression", severity: "High", confidence: "High" },
          ],
        },
      ];
    }

    case "VERSION_DRIFT": {
      return [
        {
          assumptions: {
            ltv: { value: 72, unit: "%", confidence: "High" },
            vacancy: { value: 15, unit: "%", confidence: "High" },
            cap_rate_in: { value: 5, unit: "%", confidence: "High" },
            purchase_price: { value: 8_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 400_000, unit: null, confidence: "Medium" },
            debt_rate: { value: 5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "DebtCostRisk", severity: "Medium", confidence: "High" },
          ],
        },
        {
          assumptions: {
            ltv: { value: 74, unit: "%", confidence: "High" },
            vacancy: { value: 16, unit: "%", confidence: "High" },
            cap_rate_in: { value: 5, unit: "%", confidence: "High" },
            purchase_price: { value: 8_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 410_000, unit: null, confidence: "Medium" },
            debt_rate: { value: 5.2, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "DebtCostRisk", severity: "Medium", confidence: "High" },
            { ...baseRisk, risk_type: "RentGrowthAggressive", severity: "Low", confidence: "Medium" },
          ],
        },
      ];
    }

    case "DRIVER_CAP": {
      return [
        {
          assumptions: {
            ltv: { value: 88, unit: "%", confidence: "High" },
            vacancy: { value: 28, unit: "%", confidence: "High" },
            cap_rate_in: { value: 5, unit: "%", confidence: "High" },
            purchase_price: { value: 20_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 1_000_000, unit: null, confidence: "High" },
            debt_rate: { value: 5.5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "RefiRisk", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "DebtCostRisk", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "VacancyUnderstated", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "ExitCapCompression", severity: "Medium", confidence: "High" },
            { ...baseRisk, risk_type: "DataMissing", severity: "Low", confidence: "Medium" },
          ],
        },
      ];
    }

    case "DETERIORATION": {
      return [
        {
          assumptions: {
            ltv: { value: 68, unit: "%", confidence: "High" },
            vacancy: { value: 12, unit: "%", confidence: "High" },
            cap_rate_in: { value: 5, unit: "%", confidence: "High" },
            purchase_price: { value: 12_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 600_000, unit: null, confidence: "High" },
            debt_rate: { value: 5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "DebtCostRisk", severity: "Low", confidence: "High" },
          ],
        },
        {
          assumptions: {
            ltv: { value: 78, unit: "%", confidence: "High" },
            vacancy: { value: 22, unit: "%", confidence: "High" },
            cap_rate_in: { value: 5, unit: "%", confidence: "High" },
            purchase_price: { value: 12_000_000, unit: null, confidence: "High" },
            noi_year1: { value: 550_000, unit: null, confidence: "High" },
            debt_rate: { value: 5.5, unit: "%", confidence: "High" },
          },
          risks: [
            { ...baseRisk, risk_type: "RefiRisk", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "VacancyUnderstated", severity: "High", confidence: "High" },
            { ...baseRisk, risk_type: "DebtCostRisk", severity: "Medium", confidence: "High" },
          ],
        },
      ];
    }

    default:
      return [];
  }
}
