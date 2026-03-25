import { describe, it, expect } from "vitest";
import { resolveEffectivePlan, getWorkspaceEntitlements } from "./workspace";

describe("resolveEffectivePlan", () => {
  const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now
  const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

  it("returns PRO entitlements for FREE org with active trial", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: futureDate,
      trial_plan: "PRO",
    });
    expect(effectivePlan).toBe("PRO");
    expect(trial.isTrialing).toBe(true);
    expect(trial.trialExpired).toBe(false);
    expect(trial.trialDaysRemaining).toBeGreaterThan(0);
    expect(trial.trialEndsAt).toBe(futureDate);
  });

  it("returns FREE entitlements after trial expires", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: pastDate,
      trial_plan: "PRO",
    });
    expect(effectivePlan).toBe("FREE");
    expect(trial.isTrialing).toBe(false);
    expect(trial.trialExpired).toBe(true);
    expect(trial.trialDaysRemaining).toBeLessThanOrEqual(0);
  });

  it("ignores trial fields when org has paid plan", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "PRO",
      trial_ends_at: futureDate,
      trial_plan: "PRO",
    });
    expect(effectivePlan).toBe("PRO");
    expect(trial.isTrialing).toBe(false);
    expect(trial.trialExpired).toBe(false);
  });

  it("returns no trial when trial_plan is null", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: futureDate,
      trial_plan: null,
    });
    expect(effectivePlan).toBe("FREE");
    expect(trial.isTrialing).toBe(false);
    expect(trial.trialExpired).toBe(false);
  });

  it("returns no trial when trial_ends_at is null", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: null,
      trial_plan: "PRO",
    });
    expect(effectivePlan).toBe("FREE");
    expect(trial.isTrialing).toBe(false);
  });

  it("returns no trial when both fields are null (existing org, no trial)", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: null,
      trial_plan: null,
    });
    expect(effectivePlan).toBe("FREE");
    expect(trial.isTrialing).toBe(false);
    expect(trial.trialExpired).toBe(false);
    expect(trial.trialEndsAt).toBeNull();
    expect(trial.trialDaysRemaining).toBeNull();
  });

  it("computes trialDaysRemaining correctly for 7 days", () => {
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: sevenDays,
      trial_plan: "PRO",
    });
    expect(trial.trialDaysRemaining).toBe(7);
  });

  it("computes trialDaysRemaining correctly for 1 day", () => {
    const oneDay = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const { trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: oneDay,
      trial_plan: "PRO",
    });
    expect(trial.trialDaysRemaining).toBe(1);
  });

  it("computes negative trialDaysRemaining for expired trial", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { trial } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: twoDaysAgo,
      trial_plan: "PRO",
    });
    expect(trial.trialDaysRemaining).toBeLessThan(0);
    expect(trial.trialExpired).toBe(true);
  });

  it("defaults unknown plan to FREE", () => {
    const { effectivePlan } = resolveEffectivePlan({
      plan: "UNKNOWN_PLAN",
      trial_ends_at: null,
      trial_plan: null,
    });
    expect(effectivePlan).toBe("FREE");
  });

  it("handles empty org object", () => {
    const { effectivePlan, trial } = resolveEffectivePlan({});
    expect(effectivePlan).toBe("FREE");
    expect(trial.isTrialing).toBe(false);
  });
});

describe("trial entitlements integration", () => {
  it("trial PRO org gets maxScansPerMonth: 10", () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const { effectivePlan } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: futureDate,
      trial_plan: "PRO",
    });
    const entitlements = getWorkspaceEntitlements(effectivePlan);
    expect(entitlements.maxScansPerMonth).toBe(10);
    expect(entitlements.maxLifetimeScans).toBeNull();
    expect(entitlements.canUseBenchmark).toBe(true);
    expect(entitlements.maxMembers).toBe(5);
  });

  it("expired trial gets FREE entitlements", () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const { effectivePlan } = resolveEffectivePlan({
      plan: "FREE",
      trial_ends_at: pastDate,
      trial_plan: "PRO",
    });
    const entitlements = getWorkspaceEntitlements(effectivePlan);
    expect(entitlements.maxScansPerMonth).toBeNull();
    expect(entitlements.maxLifetimeScans).toBe(3);
    expect(entitlements.canUseBenchmark).toBe(false);
  });
});
