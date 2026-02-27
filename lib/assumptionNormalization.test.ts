import { describe, it, expect } from "vitest";
import {
  normalizePercentValue,
  normalizeAssumptionsForScoring,
} from "./assumptionNormalization";
import type { DealScanAssumptions } from "./dealScanContract";

describe("normalizePercentValue", () => {
  it("converts decimal cap_rate_in 0.08 to 8", () => {
    expect(normalizePercentValue("cap_rate_in", 0.08)).toBe(8);
  });

  it("leaves cap_rate_in 5.5 unchanged (already percent range)", () => {
    expect(normalizePercentValue("cap_rate_in", 5.5)).toBe(5.5);
  });

  it("converts ltv 0.65 to 65", () => {
    expect(normalizePercentValue("ltv", 0.65)).toBe(65);
  });

  it("leaves ltv 65 unchanged", () => {
    expect(normalizePercentValue("ltv", 65)).toBe(65);
  });

  it("converts vacancy 0.05 to 5", () => {
    expect(normalizePercentValue("vacancy", 0.05)).toBe(5);
  });

  it("leaves purchase_price unchanged (not percent-like)", () => {
    expect(normalizePercentValue("purchase_price", 10_000_000)).toBe(10_000_000);
  });

  it("returns null for null value", () => {
    expect(normalizePercentValue("cap_rate_in", null)).toBeNull();
  });

  it("leaves expense_growth 1.5 unchanged (valid percent, not in 0-1)", () => {
    expect(normalizePercentValue("expense_growth", 1.5)).toBe(1.5);
  });

  it("converts rent_growth 0.03 to 3", () => {
    expect(normalizePercentValue("rent_growth", 0.03)).toBe(3);
  });

  it("leaves debt_rate 5 unchanged", () => {
    expect(normalizePercentValue("debt_rate", 5)).toBe(5);
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
