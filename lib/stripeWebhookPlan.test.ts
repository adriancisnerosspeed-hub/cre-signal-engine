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
});
