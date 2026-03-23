import { describe, it, expect } from "vitest";
import { checkBandConsistency } from "./bandConsistency";
import { RISK_INDEX_VERSION } from "./riskIndex";

describe("checkBandConsistency", () => {
  it("returns no mismatch when score and stored band match (v3)", () => {
    expect(checkBandConsistency(62, "Elevated", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(32, "Low", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(69, "High", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(33, "Moderate", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(53, "Moderate", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(54, "Elevated", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
    expect(checkBandConsistency(68, "Elevated", RISK_INDEX_VERSION)).toEqual({
      mismatch: false,
    });
  });

  it("returns mismatch with expectedBand when score=62 and stored band=High (v3: 62 is Elevated)", () => {
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
