/**
 * Deterministic midrank percentile (tie-safe).
 * count_lt = lower_bound(A, xq), count_eq = upper_bound - lower_bound,
 * rank = count_lt + 0.5 * count_eq, pct = 100 * rank / N.
 */

export type MidrankResult = {
  percentile_midrank: number;
  count_lt: number;
  count_eq: number;
  n: number;
};

/** Binary search: index of first element >= x (number of elements < x). */
function lowerBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of first element > x. */
function upperBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Compute midrank percentile for value xq in sorted array A (ascending).
 * Uses same quantization semantics as snapshot (values in A are already quantized).
 */
export function computeMidrankPercentile(
  valuesSorted: number[],
  valueQuantized: number
): MidrankResult | null {
  const n = valuesSorted.length;
  if (n === 0) return null;

  const count_lt = lowerBound(valuesSorted, valueQuantized);
  const count_le = upperBound(valuesSorted, valueQuantized);
  const count_eq = count_le - count_lt;

  const rank = count_lt + 0.5 * count_eq;
  const percentile_midrank = (100 * rank) / n;

  return {
    percentile_midrank,
    count_lt,
    count_eq,
    n,
  };
}
