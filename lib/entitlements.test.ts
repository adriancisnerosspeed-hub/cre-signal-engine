import { describe, it, expect } from "vitest";
import { getEntitlements } from "./entitlements";

describe("entitlements", () => {
  describe("FREE tier", () => {
    it("has benchmark_enabled, explainability_enabled, backtest_enabled, workspace_enabled false", () => {
      const e = getEntitlements("free");
      expect(e.benchmark_enabled).toBe(false);
      expect(e.explainability_enabled).toBe(false);
      expect(e.backtest_enabled).toBe(false);
      expect(e.workspace_enabled).toBe(false);
    });
    it("has lifetime_full_scan_limit 3", () => {
      const e = getEntitlements("free");
      expect(e.lifetime_full_scan_limit).toBe(3);
    });
  });

  describe("PRO tier", () => {
    it("has benchmark_enabled, explainability_enabled, backtest_enabled, workspace_enabled true", () => {
      const e = getEntitlements("pro");
      expect(e.benchmark_enabled).toBe(true);
      expect(e.explainability_enabled).toBe(true);
      expect(e.backtest_enabled).toBe(true);
      expect(e.workspace_enabled).toBe(true);
    });
    it("has unlimited scans", () => {
      const e = getEntitlements("pro");
      expect(e.lifetime_full_scan_limit).toBeNull();
    });
  });

  describe("OWNER tier", () => {
    it("has benchmark_enabled, explainability_enabled, backtest_enabled, workspace_enabled true", () => {
      const e = getEntitlements("owner");
      expect(e.benchmark_enabled).toBe(true);
      expect(e.explainability_enabled).toBe(true);
      expect(e.backtest_enabled).toBe(true);
      expect(e.workspace_enabled).toBe(true);
    });
  });
});
