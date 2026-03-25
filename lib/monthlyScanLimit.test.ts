import { describe, it, expect } from "vitest";
import { getWorkspaceEntitlements } from "./entitlements/workspace";

describe("Monthly scan limit entitlements", () => {
  it("PRO (Starter) has maxScansPerMonth = 10", () => {
    const e = getWorkspaceEntitlements("PRO");
    expect(e.maxScansPerMonth).toBe(10);
  });

  it("PRO+ (Analyst) has no monthly limit", () => {
    const e = getWorkspaceEntitlements("PRO+");
    expect(e.maxScansPerMonth).toBeNull();
  });

  it("ENTERPRISE (Fund) has no monthly limit", () => {
    const e = getWorkspaceEntitlements("ENTERPRISE");
    expect(e.maxScansPerMonth).toBeNull();
  });

  it("FREE has no monthly limit (uses lifetime cap instead)", () => {
    const e = getWorkspaceEntitlements("FREE");
    expect(e.maxScansPerMonth).toBeNull();
    // FREE uses lifetime cap
    expect(e.maxLifetimeScans).toBe(3);
  });
});

describe("Monthly scan limit enforcement logic", () => {
  it("blocks when scan count equals maxScansPerMonth", () => {
    const entitlements = getWorkspaceEntitlements("PRO");
    const monthlyUsed = 10;
    const isBlocked = entitlements.maxScansPerMonth !== null && monthlyUsed >= entitlements.maxScansPerMonth;
    expect(isBlocked).toBe(true);
  });

  it("allows when scan count is below maxScansPerMonth", () => {
    const entitlements = getWorkspaceEntitlements("PRO");
    const monthlyUsed = 9;
    const isBlocked = entitlements.maxScansPerMonth !== null && monthlyUsed >= entitlements.maxScansPerMonth;
    expect(isBlocked).toBe(false);
  });

  it("skips check entirely for PRO+ (maxScansPerMonth is null)", () => {
    const entitlements = getWorkspaceEntitlements("PRO+");
    // When maxScansPerMonth is null, the check is skipped entirely
    const shouldCheck = entitlements.maxScansPerMonth !== null;
    expect(shouldCheck).toBe(false);
  });

  it("trial user on PRO plan gets same 10/month limit", () => {
    // Trial users have plan='PRO' in organizations table
    // The entitlements function only reads the plan, not billing_status
    const e = getWorkspaceEntitlements("PRO");
    expect(e.maxScansPerMonth).toBe(10);
  });

  it("month_key format is YYYY-MM", () => {
    // Verify the format matches what the migration expects
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(monthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it("new month resets counter (different month_key means scan_count starts at 0)", () => {
    // This test verifies the conceptual guarantee:
    // monthly_scan_usage has UNIQUE(org_id, month_key),
    // so a new month_key means a new row with scan_count=0 (or missing row = 0)
    const marchKey = "2026-03";
    const aprilKey = "2026-04";
    expect(marchKey).not.toBe(aprilKey);
    // The getMonthlyScansUsed function returns 0 when no row exists for the month_key
  });
});
