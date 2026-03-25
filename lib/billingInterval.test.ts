import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getBillingInterval } from "./billingInterval";

describe("getBillingInterval", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STRIPE_STARTER_ANNUAL_PRICE_ID: "price_starter_annual",
      STRIPE_ANALYST_ANNUAL_PRICE_ID: "price_analyst_annual",
      STRIPE_FUND_ANNUAL_PRICE_ID: "price_fund_annual",
      STRIPE_FOUNDING_ANNUAL_PRICE_ID: "price_founding_annual",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 'annual' for annual price ID", () => {
    expect(getBillingInterval("price_starter_annual")).toBe("annual");
    expect(getBillingInterval("price_analyst_annual")).toBe("annual");
    expect(getBillingInterval("price_fund_annual")).toBe("annual");
    expect(getBillingInterval("price_founding_annual")).toBe("annual");
  });

  it("returns 'monthly' for non-annual price ID", () => {
    expect(getBillingInterval("price_monthly_starter")).toBe("monthly");
    expect(getBillingInterval("price_unknown")).toBe("monthly");
  });

  it("returns null for null input", () => {
    expect(getBillingInterval(null)).toBeNull();
  });

  it("returns 'monthly' when no annual env vars set", () => {
    delete process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;
    delete process.env.STRIPE_ANALYST_ANNUAL_PRICE_ID;
    delete process.env.STRIPE_FUND_ANNUAL_PRICE_ID;
    delete process.env.STRIPE_FOUNDING_ANNUAL_PRICE_ID;
    expect(getBillingInterval("price_starter_annual")).toBe("monthly");
  });
});
