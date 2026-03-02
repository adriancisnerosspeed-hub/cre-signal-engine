import { describe, it, expect } from "vitest";
import {
  normalizePercentValue,
  normalizeAssumptionsForScoring,
  normalizeAssumptionsForScoringWithFlags,
  normalizePercentValueWithInferred,
} from "./assumptionNormalization";
import type { DealScanAssumptions } from "./dealScanContract";

describe("normalizePercentValue", () => {
  it("converts decimal cap_rate_in 0.08 to 8 when unit is percent", () => {
    expect(normalizePercentValue("cap_rate_in", 0.08, "%")).toBe(8);
  });

  it("leaves cap_rate_in 0.08 unchanged when unit is explicit non-percent (e.g. decimal)", () => {
    expect(normalizePercentValue("cap_rate_in", 0.08, "decimal")).toBe(0.08);
  });
  it("infers fraction when unit is missing and value in (0,1] (covered in unit missing tests)", () => {
    expect(normalizePercentValue("cap_rate_in", 0.08)).toBe(8);
  });

  it("leaves cap_rate_in 5.5 unchanged (already percent range)", () => {
    expect(normalizePercentValue("cap_rate_in", 5.5, "%")).toBe(5.5);
  });

  it("converts ltv 0.65 to 65 when unit is percent", () => {
    expect(normalizePercentValue("ltv", 0.65, "percent")).toBe(65);
  });

  it("leaves ltv 65 unchanged", () => {
    expect(normalizePercentValue("ltv", 65, "%")).toBe(65);
  });

  it("converts vacancy 0.05 to 5 when unit is percent", () => {
    expect(normalizePercentValue("vacancy", 0.05, "%")).toBe(5);
  });

  it("leaves purchase_price unchanged (not percent-like)", () => {
    expect(normalizePercentValue("purchase_price", 10_000_000, "%")).toBe(10_000_000);
  });

  it("returns null for null value", () => {
    expect(normalizePercentValue("cap_rate_in", null)).toBeNull();
  });

  it("leaves expense_growth 1.5 unchanged (valid percent, not in 0-1)", () => {
    expect(normalizePercentValue("expense_growth", 1.5, "%")).toBe(1.5);
  });

  it("converts rent_growth 0.03 to 3 when unit is percent", () => {
    expect(normalizePercentValue("rent_growth", 0.03, "percent")).toBe(3);
  });

  it("leaves debt_rate 5 unchanged", () => {
    expect(normalizePercentValue("debt_rate", 5, "%")).toBe(5);
  });

  it("unit missing and 0 < value <= 1: treats as fraction (×100)", () => {
    expect(normalizePercentValue("vacancy", 0.05, null)).toBe(5);
    expect(normalizePercentValue("ltv", 0.65, undefined)).toBe(65);
    expect(normalizePercentValue("cap_rate_in", 0.055, "")).toBe(5.5);
  });

  it("unit missing and value > 1: assumes already percent (unchanged)", () => {
    expect(normalizePercentValue("vacancy", 5, null)).toBe(5);
    expect(normalizePercentValue("ltv", 80, undefined)).toBe(80);
  });

  it("non-PERCENT_KEYS with unit missing: unchanged", () => {
    expect(normalizePercentValue("purchase_price", 0.5, null)).toBe(0.5);
  });
});

describe("normalizeAssumptionsForScoring", () => {
  it("normalizes all percent-like keys in assumptions", () => {
    const assumptions: DealScanAssumptions = {
      cap_rate_in: { value: 0.055, unit: "%", confidence: "High" },
      exit_cap: { value: 6, unit: "%", confidence: "Medium" },
      ltv: { value: 0.7, unit: "%", confidence: "High" },
      purchase_price: { value: 15_000_000, unit: "USD", confidence: "Low" },
    };
    const out = normalizeAssumptionsForScoring(assumptions);
    expect(out.cap_rate_in?.value).toBe(5.5);
    expect(out.exit_cap?.value).toBe(6);
    expect(out.ltv?.value).toBe(70);
    expect(out.purchase_price?.value).toBe(15_000_000);
  });

  it("returns empty object for empty input", () => {
    expect(normalizeAssumptionsForScoring({})).toEqual({});
  });

  it("preserves unit and confidence", () => {
    const assumptions: DealScanAssumptions = {
      vacancy: { value: 0.05, unit: "%", confidence: "High" },
    };
    const out = normalizeAssumptionsForScoring(assumptions);
    expect(out.vacancy).toEqual({ value: 5, unit: "%", confidence: "High" });
  });
});

describe("normalizePercentValueWithInferred", () => {
  it("returns inferred: true when unit missing and 0 < value <= 1 for PERCENT_KEYS", () => {
    expect(normalizePercentValueWithInferred("vacancy", 0.05, null)).toEqual({ value: 5, inferred: true });
    expect(normalizePercentValueWithInferred("ltv", 1, undefined)).toEqual({ value: 100, inferred: true });
  });
  it("returns inferred: false when unit present or value > 1", () => {
    expect(normalizePercentValueWithInferred("vacancy", 0.05, "%")).toEqual({ value: 5, inferred: false });
    expect(normalizePercentValueWithInferred("vacancy", 5, null)).toEqual({ value: 5, inferred: false });
  });
});

describe("normalizeAssumptionsForScoringWithFlags", () => {
  it("returns unitInferred: true when any PERCENT_KEY had missing unit and 0 < value <= 1", () => {
    const { assumptions, unitInferred } = normalizeAssumptionsForScoringWithFlags({
      vacancy: { value: 0.05, unit: null, confidence: "High" },
      ltv: { value: 65, unit: "%", confidence: "Medium" },
    });
    expect(assumptions.vacancy?.value).toBe(5);
    expect(assumptions.ltv?.value).toBe(65);
    expect(unitInferred).toBe(true);
  });
  it("returns unitInferred: false when units present or values > 1", () => {
    const { unitInferred } = normalizeAssumptionsForScoringWithFlags({
      vacancy: { value: 5, unit: "%", confidence: "High" },
    });
    expect(unitInferred).toBe(false);
    const { unitInferred: u2 } = normalizeAssumptionsForScoringWithFlags({
      vacancy: { value: 10, unit: null, confidence: "High" },
    });
    expect(u2).toBe(false);
  });

  it("unit missing and value 0.38 for vacancy: normalizes to 38 and sets unitInferred true (for EDGE_UNIT_INFERRED + review_flag)", () => {
    const { assumptions, unitInferred } = normalizeAssumptionsForScoringWithFlags({
      vacancy: { value: 0.38, unit: null, confidence: "High" },
    });
    expect(assumptions.vacancy?.value).toBe(38);
    expect(unitInferred).toBe(true);
  });

  it("unit inference trigger: vacancy 0.38 and LTV 0.92 (unit blank) → both normalized, unitInferred true (scan sets EDGE_UNIT_INFERRED + review_flag)", () => {
    const { assumptions, unitInferred } = normalizeAssumptionsForScoringWithFlags({
      vacancy: { value: 0.38, unit: null, confidence: "High" },
      ltv: { value: 0.92, unit: undefined, confidence: "Medium" },
    });
    expect(assumptions.vacancy?.value).toBe(38);
    expect(assumptions.ltv?.value).toBe(92);
    expect(unitInferred).toBe(true);
  });
});
