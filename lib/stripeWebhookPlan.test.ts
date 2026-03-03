/**
 * Unit tests for Stripe webhook plan mapping.
 * Ensures STRIPE_PRICE_ID_PRO_PLUS (and others) map to organizations.plan correctly;
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
      STRIPE_PRICE_ID_PRO: "price_pro",
      STRIPE_PRICE_ID_PRO_PLUS: "price_proplus",
      STRIPE_PRICE_ID_ENTERPRISE: "price_ent",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("maps STRIPE_PRICE_ID_PRO_PLUS to PRO+", () => {
    expect(planFromPriceId("price_proplus")).toBe("PRO+");
  });

  it("maps STRIPE_PRICE_ID_PRO to PRO", () => {
    expect(planFromPriceId("price_pro")).toBe("PRO");
  });

  it("maps STRIPE_PRICE_ID_ENTERPRISE to ENTERPRISE", () => {
    expect(planFromPriceId("price_ent")).toBe("ENTERPRISE");
  });

  it("returns null for unknown price_id (subscription.updated must not change plan)", () => {
    expect(planFromPriceId("price_unknown")).toBeNull();
    expect(planFromPriceId(null)).toBeNull();
  });

  it("returns null when STRIPE_PRICE_ID_PRO_PLUS is unset", () => {
    delete process.env.STRIPE_PRICE_ID_PRO_PLUS;
    expect(planFromPriceId("price_proplus")).toBeNull();
  });
});
