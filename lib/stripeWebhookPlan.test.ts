/**
 * Unit tests for Stripe webhook plan mapping.
 * Ensures STRIPE_PRICE_ID_ANALYST (and others) map to organizations.plan correctly;
 * subscription.updated => PRO+ and billing_status behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { planFromPriceId } from "./stripeWebhookPlan";

describe("planFromPriceId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STRIPE_PRICE_ID_STARTER: "price_starter",
      STRIPE_PRICE_ID_ANALYST: "price_analyst",
      STRIPE_PRICE_ID_FUND: "price_fund",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("maps STRIPE_PRICE_ID_ANALYST to PRO+", () => {
    expect(planFromPriceId("price_analyst")).toBe("PRO+");
  });

  it("maps STRIPE_PRICE_ID_STARTER to PRO", () => {
    expect(planFromPriceId("price_starter")).toBe("PRO");
  });

  it("maps STRIPE_PRICE_ID_FUND to ENTERPRISE", () => {
    expect(planFromPriceId("price_fund")).toBe("ENTERPRISE");
  });

  it("returns null for unknown price_id (subscription.updated must not change plan)", () => {
    expect(planFromPriceId("price_unknown")).toBeNull();
    expect(planFromPriceId(null)).toBeNull();
  });

  it("returns null when STRIPE_PRICE_ID_ANALYST is unset", () => {
    delete process.env.STRIPE_PRICE_ID_ANALYST;
    expect(planFromPriceId("price_analyst")).toBeNull();
  });

  describe("annual price IDs", () => {
    beforeEach(() => {
      process.env.STRIPE_STARTER_ANNUAL_PRICE_ID = "price_starter_annual";
      process.env.STRIPE_ANALYST_ANNUAL_PRICE_ID = "price_analyst_annual";
      process.env.STRIPE_FUND_ANNUAL_PRICE_ID = "price_fund_annual";
      process.env.STRIPE_FOUNDING_ANNUAL_PRICE_ID = "price_founding_annual";
    });

    it("maps annual starter price to PRO", () => {
      expect(planFromPriceId("price_starter_annual")).toBe("PRO");
    });

    it("maps annual analyst price to PRO+", () => {
      expect(planFromPriceId("price_analyst_annual")).toBe("PRO+");
    });

    it("maps annual fund price to ENTERPRISE", () => {
      expect(planFromPriceId("price_fund_annual")).toBe("ENTERPRISE");
    });

    it("maps annual founding price to PRO+", () => {
      expect(planFromPriceId("price_founding_annual")).toBe("PRO+");
    });

    it("returns null for unknown price even with annual IDs set", () => {
      expect(planFromPriceId("price_unknown")).toBeNull();
    });
  });
});
