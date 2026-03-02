import { describe, it, expect } from "vitest";
import { computeExplainabilityDiff } from "./explainabilityDiff";

describe("computeExplainabilityDiff", () => {
  it("returns empty when delta_comparable is false", () => {
    const latest = { contributions: [{ driver: "leverage", points: 10 }], delta_comparable: false };
    const prev = { contributions: [{ driver: "leverage", points: 5 }] };
    expect(computeExplainabilityDiff(latest, prev, false)).toEqual([]);
  });

  it("returns empty when latest has no contributions", () => {
    const latest = { delta_comparable: true };
    const prev = { contributions: [{ driver: "leverage", points: 5 }] };
    expect(computeExplainabilityDiff(latest, prev, true)).toEqual([]);
  });

  it("returns diff sorted by absolute delta when comparable", () => {
    const latest = {
      contributions: [
        { driver: "leverage", points: 12 },
        { driver: "vacancy", points: 3 },
      ],
      delta_comparable: true,
    };
    const prev = {
      contributions: [
        { driver: "leverage", points: 5 },
        { driver: "vacancy", points: 8 },
      ],
    };
    const out = computeExplainabilityDiff(latest, prev, true);
    expect(out.length).toBe(2);
    expect(out[0].driver).toBe("leverage");
    expect(out[0].previous_points).toBe(5);
    expect(out[0].current_points).toBe(12);
    expect(out[0].delta_points).toBe(7);
    expect(out[1].driver).toBe("vacancy");
    expect(out[1].delta_points).toBe(-5);
  });

  it("does not crash when breakdown is null or missing fields", () => {
    expect(computeExplainabilityDiff(null, null)).toEqual([]);
    expect(computeExplainabilityDiff(undefined, { contributions: [] })).toEqual([]);
    expect(computeExplainabilityDiff({}, {})).toEqual([]);
  });
});
