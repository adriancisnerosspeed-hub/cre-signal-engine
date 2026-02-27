/**
 * Normalize percent-like assumption values so 0.08 and 8 both become "8 percent"
 * before scoring and range validation. Rule: if unit is percent and 0 < value < 1,
 * treat as decimal and multiply by 100. Apply only to keys: ltv, vacancy, cap_rate_in,
 * exit_cap, rent_growth, expense_growth, debt_rate.
 */

import type { DealScanAssumptions, AssumptionKey } from "./dealScanContract";

const PERCENT_KEYS = new Set<string>([
  "ltv",
  "vacancy",
  "cap_rate_in",
  "exit_cap",
  "rent_growth",
  "expense_growth",
  "debt_rate",
]);

function unitIsPercent(unit: string | null | undefined): boolean {
  if (unit == null || typeof unit !== "string") return false;
  const u = unit.trim().toLowerCase();
  return u === "percent" || u === "%" || u === "pct";
}

function unitIsMissing(unit: string | null | undefined): boolean {
  return unit == null || (typeof unit === "string" && unit.trim() === "");
}

/**
 * Normalize a single value: if key is percent-like AND unit is percent and value is in (0, 1), treat as decimal.
 * When unit is missing for PERCENT_KEYS: 0 < value <= 1 → treat as fraction (×100); value > 1 → assume already percent.
 * Returns { value, inferred } when unit was missing and value in (0,1] (inferred = true).
 */
export function normalizePercentValue(
  key: string,
  value: number | null,
  unit?: string | null
): number | null {
  if (value == null) return null;
  if (!PERCENT_KEYS.has(key)) return value;
  if (unitIsPercent(unit)) {
    if (value > 0 && value < 1) return value * 100;
    return value;
  }
  if (unitIsMissing(unit)) {
    if (value > 0 && value <= 1) return value * 100;
    return value;
  }
  return value;
}

/**
 * Normalize a single percent value; returns { value, inferred: true } when unit was missing and 0 < value <= 1.
 * Used by normalizeAssumptionsForScoringWithFlags to detect EDGE_UNIT_INFERRED.
 */
export function normalizePercentValueWithInferred(
  key: string,
  value: number | null,
  unit?: string | null
): { value: number | null; inferred: boolean } {
  if (value == null) return { value: null, inferred: false };
  if (!PERCENT_KEYS.has(key)) return { value, inferred: false };
  if (unitIsPercent(unit)) {
    if (value > 0 && value < 1) return { value: value * 100, inferred: false };
    return { value, inferred: false };
  }
  if (unitIsMissing(unit) && value > 0 && value <= 1) {
    return { value: value * 100, inferred: true };
  }
  return { value, inferred: false };
}

/**
 * Normalize all percent-like assumption values. Only applies when unit is percent (or missing for inference).
 * Non-percent keys and nulls are unchanged.
 */
export function normalizeAssumptionsForScoring(
  assumptions: DealScanAssumptions
): DealScanAssumptions {
  const { assumptions: out } = normalizeAssumptionsForScoringWithFlags(assumptions);
  return out;
}

export type NormalizeAssumptionsResult = {
  assumptions: DealScanAssumptions;
  unitInferred: boolean;
};

/**
 * Normalize percent-like values and report if any unit was inferred (missing unit, 0 < value <= 1).
 * Caller should set EDGE_UNIT_INFERRED and review_flag when unitInferred is true.
 */
export function normalizeAssumptionsForScoringWithFlags(
  assumptions: DealScanAssumptions
): NormalizeAssumptionsResult {
  const out: DealScanAssumptions = {};
  let unitInferred = false;
  for (const [key, cell] of Object.entries(assumptions)) {
    if (!cell) continue;
    const { value: v, inferred } = normalizePercentValueWithInferred(key, cell.value, cell.unit);
    if (inferred) unitInferred = true;
    out[key as AssumptionKey] = { ...cell, value: v };
  }
  return { assumptions: out, unitInferred };
}
