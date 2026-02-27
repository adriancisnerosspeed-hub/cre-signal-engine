/**
 * Assumption completeness and numeric range validation for portfolio badges and alerts.
 */

import type { DealScanAssumptions } from "./dealScanContract";

export const REQUIRED_ASSUMPTION_KEYS = [
  "cap_rate_in",
  "exit_cap",
  "noi_year1",
  "ltv",
  "vacancy",
  "debt_rate",
  "expense_growth",
  "rent_growth",
] as const;

export type RequiredAssumptionKey = (typeof REQUIRED_ASSUMPTION_KEYS)[number];

export const NUMERIC_RANGES: Record<string, [number, number]> = {
  vacancy: [0, 100],
  cap_rate_in: [0, 25],
  exit_cap: [0, 25],
  ltv: [0, 100],
  debt_rate: [0, 25],
  rent_growth: [-10, 30],
  expense_growth: [-10, 30],
  noi_year1: [0, 1e12],
  hold_period_years: [0, 50],
  purchase_price: [0, 1e15],
};

function getValue(assumptions: DealScanAssumptions | undefined, key: string): number | null {
  if (!assumptions || typeof assumptions !== "object") return null;
  const cell = (assumptions as Record<string, unknown>)[key];
  if (cell == null || typeof cell !== "object") return null;
  const v = (cell as { value?: number | null }).value;
  return v != null && typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export type AssumptionCompletenessResult = {
  pct: number;
  missing: string[];
  present: string[];
};

/**
 * Compute assumption completeness: % of REQUIRED_ASSUMPTION_KEYS that have a non-null value.
 */
export function computeAssumptionCompleteness(
  assumptions: DealScanAssumptions | undefined
): AssumptionCompletenessResult {
  const missing: string[] = [];
  const present: string[] = [];
  for (const key of REQUIRED_ASSUMPTION_KEYS) {
    const v = getValue(assumptions, key);
    if (v != null) present.push(key);
    else missing.push(key);
  }
  const total = REQUIRED_ASSUMPTION_KEYS.length;
  const pct = total === 0 ? 100 : Math.round((present.length / total) * 100);
  return { pct, missing, present };
}

export type RangeErrorItem = {
  key: string;
  value: number;
  range: [number, number];
};

export type ValidateRangesResult = {
  valid: boolean;
  errors: RangeErrorItem[];
};

/**
 * Validate that assumption values fall within expected numeric ranges.
 * Returns errors for any value outside range; does not reject, caller may log or surface.
 */
export function validateAssumptionRanges(
  assumptions: DealScanAssumptions | undefined
): ValidateRangesResult {
  const errors: RangeErrorItem[] = [];
  if (!assumptions || typeof assumptions !== "object") return { valid: true, errors };

  for (const key of Object.keys(NUMERIC_RANGES)) {
    const range = NUMERIC_RANGES[key];
    if (!range) continue;
    const v = getValue(assumptions, key);
    if (v == null) continue;
    const [min, max] = range;
    if (v < min || v > max) {
      errors.push({ key, value: v, range: [min, max] });
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Critical inputs for alerts: missing expense_growth or debt_rate. */
export const CRITICAL_ASSUMPTION_KEYS: RequiredAssumptionKey[] = ["expense_growth", "debt_rate"];

export function hasMissingCriticalInputs(assumptions: DealScanAssumptions | undefined): boolean {
  const { present } = computeAssumptionCompleteness(assumptions);
  return CRITICAL_ASSUMPTION_KEYS.some((k) => !present.includes(k));
}
