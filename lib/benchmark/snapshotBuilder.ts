/**
 * Snapshot builder: build frozen cohort snapshot + distributions + members.
 * Deterministic: same cohort + as_of_timestamp + data => same snapshot_hash.
 * Snapshot hash includes ordered deal_id:scan_id pairs for membership provenance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { resolveEligible } from "./eligibility";
import type { EligibleMember } from "./eligibility";

/** Build the ordered eligible-part string for snapshot_hash (deal_id:scan_id pairs). Exported for determinism tests. */
export function buildSnapshotHashEligiblePart(eligible: EligibleMember[]): string {
  return eligible.map((e) => `${e.deal_id}:${e.scan_id}`).join(",");
}
import {
  MIN_COHORT_N,
  BENCHMARK_VALUE_QUANTIZATION,
  PERCENTILE_METHOD_VERSION,
  METRIC_RISK_INDEX_V2,
} from "./constants";
import { BENCHMARK_ERROR_CODES } from "./constants";
import { validateRule } from "./cohortRule";

export type BuildSnapshotParams = {
  cohortId: string;
  asOfTimestamp: string;
  metricKeys?: string[];
};

export type BuildSnapshotResult = {
  snapshotId: string | null;
  buildStatus: "SUCCESS" | "FAILED" | "PARTIAL";
  buildError: string | null;
  nEligible: number;
};

const DEFAULT_METRIC_KEYS = [METRIC_RISK_INDEX_V2];

function quantize(value: number): number {
  const q = BENCHMARK_VALUE_QUANTIZATION;
  return Math.round(value / q) * q;
}

/** Map internal metric_key to deal_scans column name for INTERNAL_DEALS. */
function getMetricColumn(metricKey: string): string | null {
  if (metricKey === METRIC_RISK_INDEX_V2) return "risk_index_score";
  return null;
}

export async function buildSnapshot(
  supabase: SupabaseClient,
  params: BuildSnapshotParams
): Promise<BuildSnapshotResult> {
  const metricKeys = params.metricKeys ?? DEFAULT_METRIC_KEYS;

  const { data: cohort, error: cohortError } = await supabase
    .from("benchmark_cohorts")
    .select("id, key, version, rule_json, workspace_id, source_type")
    .eq("id", params.cohortId)
    .single();

  if (cohortError || !cohort) {
    return {
      snapshotId: null,
      buildStatus: "FAILED",
      buildError: BENCHMARK_ERROR_CODES.COHORT_NOT_FOUND,
      nEligible: 0,
    };
  }

  const rule = validateRule((cohort as { rule_json: unknown }).rule_json);
  if (!rule) {
    return {
      snapshotId: null,
      buildStatus: "FAILED",
      buildError: "INVALID_RULE",
      nEligible: 0,
    };
  }

  const eligible = await resolveEligible(supabase, {
    ruleJson: (cohort as { rule_json: unknown }).rule_json,
    workspaceId: (cohort as { workspace_id: string | null }).workspace_id,
    asOfTimestamp: params.asOfTimestamp,
  });

  const nEligible = eligible.length;

  if (nEligible < MIN_COHORT_N) {
    const { data: failedSnapshot } = await supabase
      .from("benchmark_cohort_snapshots")
      .insert({
        cohort_id: params.cohortId,
        cohort_version: (cohort as { version: number }).version,
        as_of_timestamp: params.asOfTimestamp,
        n_eligible: nEligible,
        quantization: BENCHMARK_VALUE_QUANTIZATION,
        method_version: PERCENTILE_METHOD_VERSION,
        build_status: "FAILED",
        build_error: BENCHMARK_ERROR_CODES.INSUFFICIENT_COHORT_N,
      })
      .select("id")
      .single();

    const snapshotId = (failedSnapshot as { id: string } | null)?.id ?? null;
    if (snapshotId) {
      await supabase.from("benchmark_audit_log").insert({
        snapshot_id: snapshotId,
        event: "snapshot_build_failed",
        build_status: "FAILED",
        n_eligible: nEligible,
      });
    }

    return {
      snapshotId,
      buildStatus: "FAILED",
      buildError: BENCHMARK_ERROR_CODES.INSUFFICIENT_COHORT_N,
      nEligible,
    };
  }

  const scanIds = eligible.map((e) => e.scan_id);
  const { data: scans, error: scansError } = await supabase
    .from("deal_scans")
    .select("id, risk_index_score")
    .in("id", scanIds);

  if (scansError || !scans) {
    const { data: failedSnapshot } = await supabase
      .from("benchmark_cohort_snapshots")
      .insert({
        cohort_id: params.cohortId,
        cohort_version: (cohort as { version: number }).version,
        as_of_timestamp: params.asOfTimestamp,
        n_eligible: nEligible,
        quantization: BENCHMARK_VALUE_QUANTIZATION,
        method_version: PERCENTILE_METHOD_VERSION,
        build_status: "FAILED",
        build_error: "FETCH_SCORES_FAILED",
      })
      .select("id")
      .single();
    const sid = (failedSnapshot as { id: string } | null)?.id ?? null;
    if (sid) {
      await supabase.from("benchmark_audit_log").insert({
        snapshot_id: sid,
        event: "snapshot_build_failed",
        build_status: "FAILED",
        n_eligible: nEligible,
      });
    }
    return {
      snapshotId: sid,
      buildStatus: "FAILED",
      buildError: "FETCH_SCORES_FAILED",
      nEligible,
    };
  }

  const scoreByScanId = new Map<string, number>();
  for (const row of scans as { id: string; risk_index_score: number | null }[]) {
    if (row.risk_index_score != null) {
      scoreByScanId.set(row.id, row.risk_index_score);
    }
  }

  const orderedEligiblePairs = eligible.map((e) => `${e.deal_id}:${e.scan_id}`);
  const hashParts: string[] = [
    params.cohortId,
    String((cohort as { version: number }).version),
    params.asOfTimestamp,
    PERCENTILE_METHOD_VERSION,
    String(BENCHMARK_VALUE_QUANTIZATION),
    orderedEligiblePairs.join(","),
  ];

  const distributions: {
    metric_key: string;
    values_sorted: number[];
    n: number;
    min_val: number;
    max_val: number;
    median_val: number;
  }[] = [];

  for (const metricKey of metricKeys) {
    const col = getMetricColumn(metricKey);
    if (!col) continue;

    const values: number[] = [];
    for (const { deal_id, scan_id } of eligible) {
      const score = scoreByScanId.get(scan_id);
      if (score != null) {
        values.push(quantize(score));
      }
    }
    values.sort((a, b) => a - b);
    const n = values.length;
    const min_val = n > 0 ? values[0]! : 0;
    const max_val = n > 0 ? values[n - 1]! : 0;
    const median_val =
      n > 0 ? (n % 2 === 1 ? values[Math.floor(n / 2)]! : (values[n / 2 - 1]! + values[n / 2]!) / 2) : 0;

    distributions.push({
      metric_key: metricKey,
      values_sorted: values,
      n,
      min_val,
      max_val,
      median_val,
    });
    hashParts.push(metricKey, JSON.stringify(values));
  }

  const snapshotHash = createHash("sha256").update(hashParts.join("|"), "utf8").digest("hex");

  const { data: snapshotRow, error: insertSnapshotError } = await supabase
    .from("benchmark_cohort_snapshots")
    .insert({
      cohort_id: params.cohortId,
      cohort_version: (cohort as { version: number }).version,
      as_of_timestamp: params.asOfTimestamp,
      snapshot_hash: snapshotHash,
      n_eligible: nEligible,
      quantization: BENCHMARK_VALUE_QUANTIZATION,
      method_version: PERCENTILE_METHOD_VERSION,
      build_status: "SUCCESS",
      build_error: null,
    })
    .select("id")
    .single();

  if (insertSnapshotError || !snapshotRow) {
    return {
      snapshotId: null,
      buildStatus: "FAILED",
      buildError: "INSERT_SNAPSHOT_FAILED",
      nEligible,
    };
  }

  const snapshotId = (snapshotRow as { id: string }).id;

  await supabase.from("benchmark_snapshot_members").insert(
    eligible.map((e) => ({
      snapshot_id: snapshotId,
      deal_id: e.deal_id,
      scan_id: e.scan_id,
    }))
  );

  for (const dist of distributions) {
    await supabase.from("benchmark_snapshot_distributions").insert({
      snapshot_id: snapshotId,
      metric_key: dist.metric_key,
      values_sorted: dist.values_sorted,
      n: dist.n,
      min_val: dist.min_val,
      max_val: dist.max_val,
      median_val: dist.median_val,
    });
  }

  await supabase.from("benchmark_audit_log").insert({
    snapshot_id: snapshotId,
    event: "snapshot_created",
    build_status: "SUCCESS",
    n_eligible: nEligible,
  });

  return {
    snapshotId,
    buildStatus: "SUCCESS",
    buildError: null,
    nEligible,
  };
}
