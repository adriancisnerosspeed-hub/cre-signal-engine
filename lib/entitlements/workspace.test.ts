import { describe, it, expect } from "vitest";
import { getWorkspaceEntitlements } from "./workspace";

describe("getWorkspaceEntitlements", () => {
  describe("FREE", () => {
    it("caps lifetime scans at 3 and portfolios at 1", () => {
      const e = getWorkspaceEntitlements("FREE");
      expect(e.maxLifetimeScans).toBe(3);
      expect(e.maxPortfolios).toBe(1);
    });
    it("disallows benchmark, snapshot, cohort, policy, support bundle, invites", () => {
      const e = getWorkspaceEntitlements("FREE");
      expect(e.canUseBenchmark).toBe(false);
      expect(e.canBuildSnapshot).toBe(false);
      expect(e.canCreateCohort).toBe(false);
      expect(e.canUsePolicy).toBe(false);
      expect(e.canUseSupportBundle).toBe(false);
      expect(e.canInviteMembers).toBe(false);
      expect(e.canUseAiInsights).toBe(false);
    });
    it("has maxActivePoliciesPerOrg 0", () => {
      const e = getWorkspaceEntitlements("FREE");
      expect(e.maxActivePoliciesPerOrg).toBe(0);
    });
  });

  describe("PRO", () => {
    it("has unlimited scans and 3 portfolios", () => {
      const e = getWorkspaceEntitlements("PRO");
      expect(e.maxLifetimeScans).toBeNull();
      expect(e.maxPortfolios).toBe(3);
    });
    it("allows benchmark, policy, support bundle; disallows snapshot, cohort, invites", () => {
      const e = getWorkspaceEntitlements("PRO");
      expect(e.canUseBenchmark).toBe(true);
      expect(e.canUsePolicy).toBe(true);
      expect(e.canUseSupportBundle).toBe(true);
      expect(e.canBuildSnapshot).toBe(false);
      expect(e.canCreateCohort).toBe(false);
      expect(e.canInviteMembers).toBe(false);
      expect(e.canUseAiInsights).toBe(false);
    });
    it("has maxActivePoliciesPerOrg 1", () => {
      const e = getWorkspaceEntitlements("PRO");
      expect(e.maxActivePoliciesPerOrg).toBe(1);
    });
  });

  describe("PRO+", () => {
    it("yields maxMembers=10 and maxActivePoliciesPerOrg=3", () => {
      const e = getWorkspaceEntitlements("PRO+");
      expect(e.maxMembers).toBe(10);
      expect(e.maxActivePoliciesPerOrg).toBe(3);
    });
    it("allows trajectory and governance export", () => {
      const e = getWorkspaceEntitlements("PRO+");
      expect(e.canUseTrajectory).toBe(true);
      expect(e.canUseGovernanceExport).toBe(true);
    });
    it("allows supplemental AI insights entitlement (flag still required at runtime)", () => {
      const e = getWorkspaceEntitlements("PRO+");
      expect(e.canUseAiInsights).toBe(true);
    });
    it("allows method version lock on portfolio view", () => {
      const e = getWorkspaceEntitlements("PRO+");
      expect(e.canLockMethodVersion).toBe(true);
    });
    it("has same baseline as PRO (benchmark, policy, support bundle, invites)", () => {
      const e = getWorkspaceEntitlements("PRO+");
      expect(e.canUseBenchmark).toBe(true);
      expect(e.canUsePolicy).toBe(true);
      expect(e.canUseSupportBundle).toBe(true);
      expect(e.canInviteMembers).toBe(true);
    });
  });

  describe("ENTERPRISE", () => {
    it("has unlimited scans and portfolios", () => {
      const e = getWorkspaceEntitlements("ENTERPRISE");
      expect(e.maxLifetimeScans).toBeNull();
      expect(e.maxPortfolios).toBeNull();
    });
    it("allows all features", () => {
      const e = getWorkspaceEntitlements("ENTERPRISE");
      expect(e.canUseBenchmark).toBe(true);
      expect(e.canBuildSnapshot).toBe(true);
      expect(e.canCreateCohort).toBe(true);
      expect(e.canUsePolicy).toBe(true);
      expect(e.canUseSupportBundle).toBe(true);
      expect(e.canInviteMembers).toBe(true);
      expect(e.canUseAiInsights).toBe(true);
    });
    it("has maxActivePoliciesPerOrg null (unlimited)", () => {
      const e = getWorkspaceEntitlements("ENTERPRISE");
      expect(e.maxActivePoliciesPerOrg).toBeNull();
    });
  });
});
