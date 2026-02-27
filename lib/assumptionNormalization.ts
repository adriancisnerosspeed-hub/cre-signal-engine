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

/**
 * Normalize a single value: if key is percent-like AND unit is percent and value is in (0, 1), treat as decimal.
 */
export function normalizePercentValue(
  key: string,
  value: number | null,
  unit?: string | null
): number | null {
  if (value == null) return null;
  if (!PERCENT_KEYS.has(key)) return value;
  if (!unitIsPercent(unit)) return value;
  if (value > 0 && value < 1) return value * 100;
  return value;
}

/**
 * Normalize all percent-like assumption values. Only applies when unit is percent.
 * Non-percent keys and nulls are unchanged.
 */
export function normalizeAssumptionsForScoring(
  assumptions: DealScanAssumptions
): DealScanAssumptions {
  const out: DealScanAssumptions = {};
  for (const [key, cell] of Object.entries(assumptions)) {
    if (!cell) continue;
    out[key as AssumptionKey] = {
      ...cell,
      value: normalizePercentValue(key, cell.value, cell.unit),
    };
  }
  return out;
}
