/**
 * Benchmark layer types: cohort rule DSL, snapshot, and deal benchmark result shapes.
 */

export type CohortRule =
  | { eq: [string, unknown] }
  | { neq: [string, unknown] }
  | { in: [string, unknown[]] }
  | { gte: [string, number] }
  | { lte: [string, number] }
  | { exists: [string] }
  | { and: CohortRule[] }
  | { or: CohortRule[] }
  | { not: CohortRule };

/** Context for evaluating a cohort rule: deal + canonical scan fields (flat). */
export type CohortEvalContext = Record<string, unknown>;

export type BenchmarkCohortRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: "GLOBAL" | "WORKSPACE" | "SYSTEM";
  workspace_id: string | null;
  rule_json: unknown;
  status: "ACTIVE" | "DEPRECATED";
  version: number;
  rule_hash: string | null;
  source_type: "INTERNAL_DEALS" | "EXTERNAL_FEED" | "HYBRID";
  created_at: string;
  created_by_user_id: string | null;
};

export type BenchmarkSnapshotRow = {
  id: string;
  cohort_id: string;
  cohort_version: number;
  as_of_timestamp: string;
  created_at: string;
  snapshot_hash: string | null;
  n_eligible: number;
  quantization: number;
  method_version: string;
  build_status: "SUCCESS" | "FAILED" | "PARTIAL";
  build_error: string | null;
  notes: string | null;
  source_name: string | null;
  source_dataset_version: string | null;
  source_ingested_at: string | null;
  source_hash: string | null;
};

export type DealBenchmarkRow = {
  deal_id: string;
  snapshot_id: string;
  metric_key: string;
  value_quantized: number;
  percentile_midrank: number;
  count_lt: number;
  count_eq: number;
  n: number;
  direction_adjusted_percentile: number;
  classification_band: string;
  band_version: string;
  computed_at: string;
};

/** Risk band v1: institutional classification from percentile. */
export type RiskBandV1 =
  | "SEVERE"
  | "ELEVATED"
  | "TYPICAL"
  | "LOW"
  | "VERY_LOW";
