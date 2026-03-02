/**
 * Batch and on-demand computation of deal_benchmarks from snapshot distributions.
 * Re-resolves eligible set to get (deal_id, scan_id) and fetches metric values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEligible } from "./eligibility";
import { computeMidrankPercentile } from "./percentile";
import { percentileToRiskBandV1 } from "./classification";
import {
  BENCHMARK_VALUE_QUANTIZATION,
  BAND_VERSION,
  METRIC_RISK_INDEX_V2,
  BENCHMARK_ERROR_CODES,
} from "./constants";

function quantize(value: number): number {
  const q = BENCHMARK_VALUE_QUANTIZATION;
  return Math.round(value / q) * q;
}

function getMetricColumn(metricKey: string): string | null {
  if (metricKey === METRIC_RISK_INDEX_V2) return "risk_index_score";
  return null;
}

export type ComputeBatchResult = {
  success: boolean;
  errorCode?: string;
  computedCount: number;
};

/**
 * Compute deal_benchmarks for all eligible deals in a snapshot for the given metric.
 */
export async function computeBatch(
  supabase: SupabaseClient,
  params: { snapshotId: string; metricKey?: string }
): Promise<ComputeBatchResult> {
  const metricKey = params.metricKey ?? METRIC_RISK_INDEX_V2;
  const col = getMetricColumn(metricKey);
  if (!col) {
    return { success: false, errorCode: BENCHMARK_ERROR_CODES.METRIC_NOT_SUPPORTED, computedCount: 0 };
  }

  const { data: snapshot, error: snapError } = await supabase
    .from("benchmark_cohort_snapshots")
    .select("id, cohort_id, cohort_version, as_of_timestamp, build_status")
    .eq("id", params.snapshotId)
    .single();

  if (snapError || !snapshot) {
    return { success: false, errorCode: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_FOUND, computedCount: 0 };
  }

  const s = snapshot as {
    cohort_id: string;
    as_of_timestamp: string;
    build_status: string;
  };
  if (s.build_status !== "SUCCESS") {
    return {
      success: false,
      errorCode: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_READY,
      computedCount: 0,
    };
  }

  const { data: cohort } = await supabase
    .from("benchmark_cohorts")
    .select("id, rule_json, workspace_id")
    .eq("id", s.cohort_id)
    .single();

  if (!cohort) {
    return { success: false, errorCode: BENCHMARK_ERROR_CODES.COHORT_NOT_FOUND, computedCount: 0 };
  }

  const { data: distRow } = await supabase
    .from("benchmark_snapshot_distributions")
    .select("values_sorted, n")
    .eq("snapshot_id", params.snapshotId)
    .eq("metric_key", metricKey)
    .single();

  if (!distRow) {
    return { success: false, errorCode: BENCHMARK_ERROR_CODES.METRIC_NOT_SUPPORTED, computedCount: 0 };
  }

  const valuesSorted = (distRow as { values_sorted: number[] }).values_sorted as number[];
  const eligible = await resolveEligible(supabase, {
    ruleJson: (cohort as { rule_json: unknown }).rule_json,
    workspaceId: (cohort as { workspace_id: string | null }).workspace_id,
    asOfTimestamp: s.as_of_timestamp,
  });

  if (eligible.length === 0) {
    return { success: true, computedCount: 0 };
  }

  const scanIds = eligible.map((e) => e.scan_id);
  const { data: scans } = await supabase
    .from("deal_scans")
    .select("id, risk_index_score")
    .in("id", scanIds);

  const scoreByScanId = new Map<string, number>();
  for (const row of (scans ?? []) as { id: string; risk_index_score: number | null }[]) {
    if (row.risk_index_score != null) {
      scoreByScanId.set(row.id, row.risk_index_score);
    }
  }

  const now = new Date().toISOString();
  let computedCount = 0;

  for (const { deal_id, scan_id } of eligible) {
    const rawScore = scoreByScanId.get(scan_id);
    if (rawScore == null) continue;

    const valueQuantized = quantize(rawScore);
    const midrank = computeMidrankPercentile(valuesSorted, valueQuantized);
    if (!midrank) continue;

    const directionAdjustedPercentile =
      metricKey === METRIC_RISK_INDEX_V2 ? midrank.percentile_midrank : midrank.percentile_midrank;
    const classificationBand = percentileToRiskBandV1(directionAdjustedPercentile);

    await supabase.from("deal_benchmarks").upsert(
      {
        deal_id,
        snapshot_id: params.snapshotId,
        metric_key: metricKey,
        value_quantized: valueQuantized,
        percentile_midrank: midrank.percentile_midrank,
        count_lt: midrank.count_lt,
        count_eq: midrank.count_eq,
        n: midrank.n,
        direction_adjusted_percentile: directionAdjustedPercentile,
        classification_band: classificationBand,
        band_version: BAND_VERSION,
        computed_at: now,
      },
      { onConflict: "deal_id,snapshot_id,metric_key" }
    );
    computedCount++;
  }

  return { success: true, computedCount };
}

export type DealBenchmarkResult = {
  found: boolean;
  errorCode?: string;
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
};

/**
 * Get or compute benchmark for a single deal and snapshot.
 * Returns null with errorCode VALUE_MISSING_FOR_DEAL if deal is not in snapshot.
 */
export async function getOrComputeDealBenchmark(
  supabase: SupabaseClient,
  params: { dealId: string; snapshotId: string; metricKey?: string }
): Promise<DealBenchmarkResult | null> {
  const metricKey = params.metricKey ?? METRIC_RISK_INDEX_V2;

  const { data: existing } = await supabase
    .from("deal_benchmarks")
    .select("*")
    .eq("deal_id", params.dealId)
    .eq("snapshot_id", params.snapshotId)
    .eq("metric_key", metricKey)
    .single();

  if (existing) {
    const e = existing as {
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
    };
    return {
      found: true,
      deal_id: e.deal_id,
      snapshot_id: e.snapshot_id,
      metric_key: e.metric_key,
      value_quantized: e.value_quantized,
      percentile_midrank: e.percentile_midrank,
      count_lt: e.count_lt,
      count_eq: e.count_eq,
      n: e.n,
      direction_adjusted_percentile: e.direction_adjusted_percentile,
      classification_band: e.classification_band,
      band_version: e.band_version,
    };
  }

  const batchResult = await computeBatch(supabase, {
    snapshotId: params.snapshotId,
    metricKey,
  });
  if (!batchResult.success) {
    return null;
  }

  const { data: after } = await supabase
    .from("deal_benchmarks")
    .select("*")
    .eq("deal_id", params.dealId)
    .eq("snapshot_id", params.snapshotId)
    .eq("metric_key", metricKey)
    .single();

  if (!after) {
    return null;
  }

  const a = after as {
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
  };
  return {
    found: true,
    deal_id: a.deal_id,
    snapshot_id: a.snapshot_id,
    metric_key: a.metric_key,
    value_quantized: a.value_quantized,
    percentile_midrank: a.percentile_midrank,
    count_lt: a.count_lt,
    count_eq: a.count_eq,
    n: a.n,
    direction_adjusted_percentile: a.direction_adjusted_percentile,
    classification_band: a.classification_band,
    band_version: a.band_version,
  };
}
