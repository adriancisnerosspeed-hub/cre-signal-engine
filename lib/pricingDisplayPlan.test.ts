/**
 * Unit tests for pricing displayPlan logic.
 * Ensures workspace plan PRO+ (and others) map to correct UI state so PRO+ section
 * shows as active and "Buy PRO+" is not shown when already on PRO+.
 */
import { describe, it, expect } from "vitest";
import { getDisplayPlan } from "./pricingDisplayPlan";

describe("getDisplayPlan", () => {
  it("returns pro_plus when workspace plan is PRO+ (PRO+ section active, no Buy PRO+ button)", () => {
    expect(getDisplayPlan("user", "PRO+")).toBe("pro_plus");
    expect(getDisplayPlan("free", "PRO+")).toBe("pro_plus");
  });

  it("returns platform_admin when profile is platform_admin regardless of workspace", () => {
    expect(getDisplayPlan("platform_admin", null)).toBe("platform_admin");
    expect(getDisplayPlan("platform_admin", "PRO")).toBe("platform_admin");
    expect(getDisplayPlan("platform_admin", "PRO+")).toBe("platform_admin");
  });

  it("returns enterprise when workspace plan is ENTERPRISE", () => {
    expect(getDisplayPlan("user", "ENTERPRISE")).toBe("enterprise");
  });

  it("returns pro when workspace plan is PRO", () => {
    expect(getDisplayPlan("user", "PRO")).toBe("pro");
  });

  it("returns free when workspace plan is FREE or null", () => {
    expect(getDisplayPlan("user", "FREE")).toBe("free");
    expect(getDisplayPlan("user", null)).toBe("free");
  });
});
