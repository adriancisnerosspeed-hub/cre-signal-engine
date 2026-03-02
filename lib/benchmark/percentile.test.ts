import { describe, it, expect } from "vitest";
import { computeMidrankPercentile } from "./percentile";

describe("computeMidrankPercentile", () => {
  it("returns null for empty array", () => {
    expect(computeMidrankPercentile([], 5)).toBeNull();
  });

  it("computes percentile for unique values", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r = computeMidrankPercentile(sorted, 5);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(4);
    expect(r!.count_eq).toBe(1);
    expect(r!.n).toBe(10);
    // rank = 4 + 0.5 = 4.5, pct = 45
    expect(r!.percentile_midrank).toBe(45);
  });

  it("handles value below min", () => {
    const sorted = [10, 20, 30];
    const r = computeMidrankPercentile(sorted, 5);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(0);
    expect(r!.count_eq).toBe(0);
    expect(r!.percentile_midrank).toBe(0);
  });

  it("handles value above max", () => {
    const sorted = [10, 20, 30];
    const r = computeMidrankPercentile(sorted, 35);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(3);
    expect(r!.count_eq).toBe(0);
    expect(r!.percentile_midrank).toBe(100);
  });

  it("handles all ties", () => {
    const sorted = [5, 5, 5, 5, 5];
    const r = computeMidrankPercentile(sorted, 5);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(0);
    expect(r!.count_eq).toBe(5);
    // rank = 0 + 2.5 = 2.5, pct = 50
    expect(r!.percentile_midrank).toBe(50);
  });

  it("handles ties at lower extreme", () => {
    const sorted = [1, 1, 1, 4, 5];
    const r = computeMidrankPercentile(sorted, 1);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(0);
    expect(r!.count_eq).toBe(3);
    // rank = 0 + 1.5 = 1.5, pct = 30
    expect(r!.percentile_midrank).toBe(30);
  });

  it("handles ties at upper extreme", () => {
    const sorted = [1, 2, 3, 10, 10, 10];
    const r = computeMidrankPercentile(sorted, 10);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(3);
    expect(r!.count_eq).toBe(3);
    // rank = 3 + 1.5 = 4.5, pct = 75
    expect(r!.percentile_midrank).toBe(75);
  });

  it("value not in distribution (between two values) gives count_lt only", () => {
    const sorted = [1, 2, 4, 5];
    const r = computeMidrankPercentile(sorted, 3);
    expect(r).not.toBeNull();
    expect(r!.count_lt).toBe(2);
    expect(r!.count_eq).toBe(0);
    expect(r!.percentile_midrank).toBe(50);
  });
});
