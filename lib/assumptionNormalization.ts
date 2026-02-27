/**
 * Normalize percent-like assumption values so 0.08 and 8 both become "8 percent"
 * before scoring and range validation. Rule: if 0 < value < 1 for a percent-like
 * field, treat as decimal and multiply by 100.
 */

import type { DealScanAssumptions, AssumptionKey } from "./dealScanContract";

const PERCENT_LIKE_KEYS = new Set<string>([
  "cap_rate_in",
  "exit_cap",
  "debt_rate",
  "rent_growth",
  "expense_growth",
  "vacancy",
  "ltv",
]);

/**
 * Normalize a single value: if key is percent-like and value is in (0, 1), treat as decimal.
 */
export function normalizePercentValue(key: string, value: number | null): number | null {
  if (value == null) return null;
  if (!PERCENT_LIKE_KEYS.has(key)) return value;
  if (value > 0 && value < 1) return value * 100;
  return value;
}

/**
 * Normalize all percent-like assumption values. Non-percent keys and nulls are unchanged.
 */
export function normalizeAssumptionsForScoring(
  assumptions: DealScanAssumptions
): DealScanAssumptions {
  const out: DealScanAssumptions = {};
  for (const [key, cell] of Object.entries(assumptions)) {
    if (!cell) continue;
    out[key as AssumptionKey] = {
      ...cell,
      value: normalizePercentValue(key, cell.value),
    };
  }
  return out;
}
