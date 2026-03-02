import { describe, it, expect } from "vitest";
import { buildFixtureScenarios, type FixtureType } from "./fixtureBuilder";

describe("buildFixtureScenarios", () => {
  it("returns one scenario for UNIT_INFERENCE with vacancy and ltv unit null", () => {
    const scenarios = buildFixtureScenarios("UNIT_INFERENCE");
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].assumptions.vacancy?.value).toBe(0.38);
    expect(scenarios[0].assumptions.vacancy?.unit).toBeNull();
    expect(scenarios[0].assumptions.ltv?.value).toBe(0.92);
    expect(scenarios[0].assumptions.ltv?.unit).toBeNull();
    expect(scenarios[0].risks.length).toBeGreaterThan(0);
  });

  it("returns one scenario for EXTREME_LEVERAGE with ltv 92 and exit cap compression", () => {
    const scenarios = buildFixtureScenarios("EXTREME_LEVERAGE");
    expect(scenarios).toHaveLength(1);
    const capIn = scenarios[0].assumptions.cap_rate_in?.value ?? 0;
    const exitCap = scenarios[0].assumptions.exit_cap?.value ?? 0;
    expect(scenarios[0].assumptions.ltv?.value).toBe(92);
    expect(scenarios[0].assumptions.vacancy?.value).toBe(35);
    expect(capIn - exitCap).toBeCloseTo(1.2);
  });

  it("returns two scenarios for VERSION_DRIFT", () => {
    const scenarios = buildFixtureScenarios("VERSION_DRIFT");
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].risks.length).toBeLessThanOrEqual(scenarios[1].risks.length);
  });

  it("returns one scenario for DRIVER_CAP with multiple high-severity risks", () => {
    const scenarios = buildFixtureScenarios("DRIVER_CAP");
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].risks.length).toBeGreaterThanOrEqual(3);
    const highCount = scenarios[0].risks.filter((r) => r.severity === "High").length;
    expect(highCount).toBeGreaterThanOrEqual(2);
  });

  it("returns two scenarios for DETERIORATION", () => {
    const scenarios = buildFixtureScenarios("DETERIORATION");
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].risks.length).toBeLessThan(scenarios[1].risks.length);
  });

  it("returns empty array for invalid type (caller must validate)", () => {
    const scenarios = buildFixtureScenarios("INVALID" as FixtureType);
    expect(scenarios).toEqual([]);
  });
});
