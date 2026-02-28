import { describe, it, expect } from "vitest";
import { checkBandConsistency } from "./bandConsistency";
import { RISK_INDEX_VERSION } from "./riskIndex";

describe("checkBandConsistency", () => {
  it("returns no mismatch when score and stored band match (v2)", () => {
    expect(checkBandConsistency(62, "Elevated", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(34, "Low", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(70, "High", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
  });

  it("returns mismatch with expectedBand when score=62 and stored band=High (v2: 62 is Elevated)", () => {
    const result = checkBandConsistency(62, "High", RISK_INDEX_VERSION);
    expect(result.mismatch).toBe(true);
    expect(result.expectedBand).toBe("Elevated");
  });

  it("returns no mismatch when version differs (different model thresholds)", () => {
    expect(checkBandConsistency(62, "High", "1.0")).toEqual({ mismatch: false });
    expect(checkBandConsistency(62, "High", null)).toEqual({ mismatch: false });
    expect(checkBandConsistency(62, "High", "")).toEqual({ mismatch: false });
  });

  it("returns no mismatch when score or band is null", () => {
    expect(checkBandConsistency(null, "High", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(62, null, RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
  });
});
