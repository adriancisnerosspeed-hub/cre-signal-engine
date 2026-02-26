import { describe, it, expect } from "vitest";
import { isSignalRelevant, inferSignalContext } from "./macroRelevance";

describe("isSignalRelevant", () => {
  it("allows when no asset_type/state on signal or deal", () => {
    expect(isSignalRelevant({}, {})).toBe(true);
    expect(isSignalRelevant({ category: "Supply" }, { asset_type: "Office" })).toBe(true);
  });

  it("filters by asset_type when both set", () => {
    expect(isSignalRelevant({ asset_type: "multifamily" }, { asset_type: "multifamily" })).toBe(true);
    expect(isSignalRelevant({ asset_type: "multifamily" }, { asset_type: "office" })).toBe(false);
    expect(isSignalRelevant({ asset_type: "industrial" }, { asset_type: "office" })).toBe(false);
  });

  it("filters by state when both set", () => {
    expect(isSignalRelevant({ state: "Florida" }, { state: "Florida" })).toBe(true);
    expect(isSignalRelevant({ state: "Florida" }, { state: "Phoenix" })).toBe(false);
  });

  it("uses market when state not set on deal", () => {
    expect(isSignalRelevant({ state: "phoenix" }, { market: "Phoenix" })).toBe(true);
    expect(isSignalRelevant({ state: "florida" }, { market: "Phoenix" })).toBe(false);
  });
});

describe("inferSignalContext", () => {
  it("infers asset_type from signal_type/text", () => {
    expect(inferSignalContext("Multifamily Supply", null).asset_type).toBe("multifamily");
    expect(inferSignalContext("Supply-Demand", "3-year pipeline multifamily units").asset_type).toBe("multifamily");
    expect(inferSignalContext("Office Vacancy", null).asset_type).toBe("office");
    expect(inferSignalContext("Retail", null).asset_type).toBe("retail");
    expect(inferSignalContext("Industrial", null).asset_type).toBe("industrial");
  });

  it("infers state-like from text", () => {
    expect(inferSignalContext(null, "Florida insurance market").state).toBe("florida");
    expect(inferSignalContext(null, "Phoenix absorption").state).toBe("phoenix");
  });
});
