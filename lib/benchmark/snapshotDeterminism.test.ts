/**
 * Snapshot determinism: same inputs => same percentile and band outputs.
 * Uses in-memory distribution (no DB); verifies midrank + classification pipeline.
 */

import { describe, it, expect } from "vitest";
import { computeMidrankPercentile } from "./percentile";
import { percentileToRiskBandV1 } from "./classification";
import { buildSnapshotHashEligiblePart } from "./snapshotBuilder";
import { BENCHMARK_VALUE_QUANTIZATION } from "./constants";

function quantize(value: number): number {
  return Math.round(value / BENCHMARK_VALUE_QUANTIZATION) * BENCHMARK_VALUE_QUANTIZATION;
}

describe("snapshot determinism", () => {
  const fixedDistribution = [10, 20, 25, 25, 30, 40, 50, 60, 70, 80].map(quantize).sort((a, b) => a - b);

  it("same value and distribution produce same percentile twice", () => {
    const value = quantize(25);
    const r1 = computeMidrankPercentile(fixedDistribution, value);
    const r2 = computeMidrankPercentile(fixedDistribution, value);
    expect(r1).toEqual(r2);
    expect(r1?.percentile_midrank).toBeDefined();
  });

  it("percentile and band are deterministic for fixed inputs", () => {
    const value = quantize(70);
    const midrank = computeMidrankPercentile(fixedDistribution, value);
    expect(midrank).not.toBeNull();
    const band = percentileToRiskBandV1(midrank!.percentile_midrank);
    expect(band).toBe("ELEVATED"); // 70 is at index 8; count_lt=7, count_eq=1; rank=7.5; pct=75
  });

  it("tie at 25 produces stable midrank", () => {
    const value = quantize(25);
    const r = computeMidrankPercentile(fixedDistribution, value);
    expect(r?.count_eq).toBe(2);
    expect(r?.count_lt).toBe(2);
    // rank = 2 + 1 = 3, pct = 30
    expect(r?.percentile_midrank).toBe(30);
    expect(percentileToRiskBandV1(r!.percentile_midrank)).toBe("LOW");
  });

  it("quantization and sort are deterministic (same input => same output)", () => {
    const raw = [33.1, 33.2, 33.0];
    const q1 = raw.map(quantize).sort((a, b) => a - b);
    const q2 = raw.map(quantize).sort((a, b) => a - b);
    expect(q1).toEqual(q2);
    expect(q1.length).toBe(3);
    expect(q1[0]).toBe(33);
  });

  it("changing scan_id selection changes snapshot_hash eligible part (provenance)", () => {
    const eligibleSameDealScan1 = [{ deal_id: "d1", scan_id: "s1" }];
    const eligibleSameDealScan2 = [{ deal_id: "d1", scan_id: "s2" }];
    const part1 = buildSnapshotHashEligiblePart(eligibleSameDealScan1);
    const part2 = buildSnapshotHashEligiblePart(eligibleSameDealScan2);
    expect(part1).not.toBe(part2);
    expect(part1).toBe("d1:s1");
    expect(part2).toBe("d1:s2");
  });
});
