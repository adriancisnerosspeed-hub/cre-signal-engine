import { describe, it, expect } from "vitest";
import { percentileToRiskBandV1 } from "./classification";

describe("percentileToRiskBandV1", () => {
  it("P90–P100 => SEVERE", () => {
    expect(percentileToRiskBandV1(90)).toBe("SEVERE");
    expect(percentileToRiskBandV1(95)).toBe("SEVERE");
    expect(percentileToRiskBandV1(100)).toBe("SEVERE");
  });

  it("P75–P90 => ELEVATED", () => {
    expect(percentileToRiskBandV1(75)).toBe("ELEVATED");
    expect(percentileToRiskBandV1(80)).toBe("ELEVATED");
    expect(percentileToRiskBandV1(89.9)).toBe("ELEVATED");
  });

  it("P40–P75 => TYPICAL", () => {
    expect(percentileToRiskBandV1(40)).toBe("TYPICAL");
    expect(percentileToRiskBandV1(50)).toBe("TYPICAL");
    expect(percentileToRiskBandV1(74.9)).toBe("TYPICAL");
  });

  it("P10–P40 => LOW", () => {
    expect(percentileToRiskBandV1(10)).toBe("LOW");
    expect(percentileToRiskBandV1(25)).toBe("LOW");
    expect(percentileToRiskBandV1(39.9)).toBe("LOW");
  });

  it("P0–P10 => VERY_LOW", () => {
    expect(percentileToRiskBandV1(0)).toBe("VERY_LOW");
    expect(percentileToRiskBandV1(5)).toBe("VERY_LOW");
    expect(percentileToRiskBandV1(9.9)).toBe("VERY_LOW");
  });
});
