/**
 * Benchmark layer constants. Do not change without versioning; used for determinism.
 */

export const MIN_COHORT_N = 200;
export const BENCHMARK_VALUE_QUANTIZATION = 1e-6;
export const PERCENTILE_METHOD_VERSION = "midrank_v1";
export const BAND_VERSION = "risk_band_v1";

export const BENCHMARK_ERROR_CODES = {
  COHORT_NOT_FOUND: "COHORT_NOT_FOUND",
  SNAPSHOT_NOT_FOUND: "SNAPSHOT_NOT_FOUND",
  SNAPSHOT_NOT_READY: "SNAPSHOT_NOT_READY",
  BENCHMARK_WRITE_FORBIDDEN: "BENCHMARK_WRITE_FORBIDDEN",
  INSUFFICIENT_COHORT_N: "INSUFFICIENT_COHORT_N",
  METRIC_NOT_SUPPORTED: "METRIC_NOT_SUPPORTED",
  VALUE_MISSING_FOR_DEAL: "VALUE_MISSING_FOR_DEAL",
} as const;

export type BenchmarkErrorCode =
  (typeof BENCHMARK_ERROR_CODES)[keyof typeof BENCHMARK_ERROR_CODES];

/** Internal metric key for risk index v2; maps to deal_scans.risk_index_score */
export const METRIC_RISK_INDEX_V2 = "risk_index_v2";
