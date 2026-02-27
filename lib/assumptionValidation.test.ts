import { describe, it, expect } from "vitest";
import {
  computeAssumptionCompleteness,
  validateAssumptionRanges,
  hasMissingCriticalInputs,
  validateAndSanitizeForRiskIndex,
  REQUIRED_ASSUMPTION_KEYS,
} from "./assumptionValidation";
import type { DealScanAssumptions } from "./dealScanContract";

function cell(value: number, unit?: string, confidence = "Low"): { value: number; unit: string | null; confidence: string } {
  return { value, unit: unit ?? null, confidence };
}

describe("computeAssumptionCompleteness", () => {
  it("returns 100% when all required keys present", () => {
    const assumptions: DealScanAssumptions = {};
    for (const key of REQUIRED_ASSUMPTION_KEYS) {
      (assumptions as Record<string, unknown>)[key] = cell(1);
    }
    const r = computeAssumptionCompleteness(assumptions);
    expect(r.pct).toBe(100);
    expect(r.missing).toHaveLength(0);
    expect(r.present).toHaveLength(REQUIRED_ASSUMPTION_KEYS.length);
  });

  it("returns 50% when half present", () => {
    const assumptions: DealScanAssumptions = {
      cap_rate_in: cell(5),
      exit_cap: cell(5),
      noi_year1: cell(1e6),
      ltv: cell(65),
      vacancy: cell(5),
    };
    const r = computeAssumptionCompleteness(assumptions);
    expect(r.pct).toBe(63); // 5/8 rounded
    expect(r.missing).toContain("debt_rate");
    expect(r.missing).toContain("expense_growth");
    expect(r.missing).toContain("rent_growth");
  });

  it("returns 0% and all missing for empty", () => {
    const r = computeAssumptionCompleteness(undefined);
    expect(r.pct).toBe(0);
    expect(r.missing).toHaveLength(REQUIRED_ASSUMPTION_KEYS.length);
    expect(r.present).toHaveLength(0);
  });
});

describe("validateAssumptionRanges", () => {
  it("valid when all values in range", () => {
    const assumptions: DealScanAssumptions = {
      vacancy: cell(10),
      cap_rate_in: cell(5),
      ltv: cell(70),
    };
    const r = validateAssumptionRanges(assumptions);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("invalid when vacancy > 100", () => {
    const assumptions: DealScanAssumptions = { vacancy: cell(101) };
    const r = validateAssumptionRanges(assumptions);
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].key).toBe("vacancy");
    expect(r.errors[0].value).toBe(101);
    expect(r.errors[0].range).toEqual([0, 100]);
  });

  it("invalid when cap_rate_in > 25", () => {
    const assumptions: DealScanAssumptions = { cap_rate_in: cell(30) };
    const r = validateAssumptionRanges(assumptions);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.key === "cap_rate_in" && e.value === 30)).toBe(true);
  });

  it("valid for undefined assumptions", () => {
    const r = validateAssumptionRanges(undefined);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe("hasMissingCriticalInputs", () => {
  it("true when expense_growth missing", () => {
    const assumptions: DealScanAssumptions = { debt_rate: cell(5) };
    expect(hasMissingCriticalInputs(assumptions)).toBe(true);
  });

  it("true when debt_rate missing", () => {
    const assumptions: DealScanAssumptions = { expense_growth: cell(3) };
    expect(hasMissingCriticalInputs(assumptions)).toBe(true);
  });

  it("false when both present", () => {
    const assumptions: DealScanAssumptions = {
      expense_growth: cell(3),
      debt_rate: cell(5),
    };
    expect(hasMissingCriticalInputs(assumptions)).toBe(false);
  });
});

describe("validateAndSanitizeForRiskIndex", () => {
  it("returns sanitized copy and no errors for valid assumptions", () => {
    const assumptions: DealScanAssumptions = {
      ltv: cell(70),
      vacancy: cell(10),
      purchase_price: cell(1e6),
    };
    const { sanitizedAssumptions, validation_errors, severe } = validateAndSanitizeForRiskIndex(assumptions);
    expect(validation_errors).toHaveLength(0);
    expect(severe).toBe(false);
    expect(sanitizedAssumptions.ltv?.value).toBe(70);
  });

  it("sets severe and error when purchase_price <= 0", () => {
    const assumptions: DealScanAssumptions = { purchase_price: cell(0) };
    const { validation_errors, severe } = validateAndSanitizeForRiskIndex(assumptions);
    expect(validation_errors.some((e) => e.includes("purchase_price"))).toBe(true);
    expect(severe).toBe(true);
  });

  it("clamps out-of-range percent fields and adds error", () => {
    const assumptions: DealScanAssumptions = { ltv: cell(150), vacancy: cell(5) };
    const { sanitizedAssumptions, validation_errors } = validateAndSanitizeForRiskIndex(assumptions);
    expect(sanitizedAssumptions.ltv?.value).toBe(100);
    expect(validation_errors.some((e) => e.includes("ltv"))).toBe(true);
  });

  it("adds error for negative noi_year1", () => {
    const assumptions: DealScanAssumptions = { noi_year1: cell(-100) };
    const { validation_errors } = validateAndSanitizeForRiskIndex(assumptions);
    expect(validation_errors.some((e) => e.includes("noi_year1"))).toBe(true);
  });
});
