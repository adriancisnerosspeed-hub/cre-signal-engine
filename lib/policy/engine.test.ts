import { describe, it, expect } from "vitest";
import { evaluateRiskPolicy } from "./engine";
import type { PortfolioSummary } from "@/lib/portfolioSummary";
import type { RiskPolicyRow } from "./types";

function emptyPortfolio(): PortfolioSummary {
  return {
    deals: [],
    counts: { total: 0, scanned: 0, unscanned: 0, stale: 0, needsReview: 0 },
    distributionByBand: {},
    exposureByAsset: {},
    exposureByMarket: {},
    topDealsByScore: [],
    recurringRisks: [],
    riskComposition: { structuralPct: 0, marketPct: 0 },
    macroExposure: [],
    trendSummary: { deteriorations: [], bandTransitions: [] },
    alerts: [],
    dealBadges: new Map(),
    dealExplainability: new Map(),
    weightedMetrics: {
      pctElevatedPlusByCount: 0,
      pctElevatedPlusByWeight: 0,
      weightedAvgScore: 0,
      hasWeightData: false,
    },
    concentration: { topMarketPct: 0, topAssetTypePct: 0, elevatedPlusByMarket: [], highImpactDeteriorations: [] },
    prpi: { prpi_score: 0, prpi_band: "Low", components: { weighted_average_score: 0, pct_exposure_high: 0, pct_exposure_elevated_plus: 0, pct_exposure_deteriorating: 0, top_market_concentration_pct: 0, top_asset_concentration_pct: 0 } },
    risk_movement: { deteriorated: 0, crossed_tiers: 0, version_drift: 0, total_affected: 0, deal_ids: { deteriorated: [], crossed_tiers: [], version_drift: [] } },
  };
}

function policy(name: string, rules: unknown): RiskPolicyRow {
  return {
    id: "policy-1",
    organization_id: "org-1",
    created_by: "user-1",
    name,
    description: null,
    is_enabled: true,
    is_shared: true,
    severity_threshold: "warn",
    rules_json: rules,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

describe("evaluateRiskPolicy", () => {
  it("empty portfolio -> PASS", () => {
    const pol = policy("Test", [
      { id: "r1", name: "Elevated+ cap", type: "MAX_ELEVATED_PLUS_PCT", threshold_pct: 25, scope: "scanned_only", enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio: emptyPortfolio(),
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("PASS");
    expect(result.violation_count).toBe(0);
    expect(result.policy_name).toBe("Test");
  });

  it("elevated+ rule triggered when over threshold", () => {
    const portfolio: PortfolioSummary = {
      ...emptyPortfolio(),
      deals: [
        { id: "d1", name: "D1", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s1", latest_risk_score: 60, latest_risk_band: "Elevated", latest_scanned_at: "2025-01-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
        { id: "d2", name: "D2", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s2", latest_risk_score: 40, latest_risk_band: "Moderate", latest_scanned_at: "2025-01-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
      ],
      counts: { total: 2, scanned: 2, unscanned: 0, stale: 0, needsReview: 0 },
      distributionByBand: { Elevated: 1, Moderate: 1 },
      concentration: { topMarketPct: 100, topAssetTypePct: 100, elevatedPlusByMarket: [], highImpactDeteriorations: [] },
      prpi: { prpi_score: 50, prpi_band: "Moderate", components: { weighted_average_score: 50, pct_exposure_high: 0, pct_exposure_elevated_plus: 50, pct_exposure_deteriorating: 0, top_market_concentration_pct: 100, top_asset_concentration_pct: 100 } },
      dealBadges: new Map([["d1", ["unscanned"]], ["d2", []]]),
    };
    const pol = policy("Elevated+ cap", [
      { id: "r1", name: "Max Elevated+ 25%", type: "MAX_ELEVATED_PLUS_PCT", threshold_pct: 25, scope: "scanned_only", enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio,
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    expect(result.violation_count).toBeGreaterThanOrEqual(1);
    const v = result.violations.find((x) => x.type === "MAX_ELEVATED_PLUS_PCT");
    expect(v).toBeDefined();
    expect(v!.actual_value).toBeGreaterThan(25);
  });

  it("stale scans rule triggered when over threshold", () => {
    const dealBadges = new Map<string, ("unscanned" | "stale" | "needs_review")[]>();
    dealBadges.set("d1", ["stale"]);
    dealBadges.set("d2", []);
    const portfolio: PortfolioSummary = {
      ...emptyPortfolio(),
      deals: [
        { id: "d1", name: "D1", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s1", latest_risk_score: 50, latest_risk_band: "Moderate", latest_scanned_at: "2024-01-01", scan_count: 1, ic_status: null, created_at: "2024-01-01" },
        { id: "d2", name: "D2", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s2", latest_risk_score: 50, latest_risk_band: "Moderate", latest_scanned_at: "2025-02-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
      ],
      counts: { total: 2, scanned: 2, unscanned: 0, stale: 1, needsReview: 0 },
      distributionByBand: { Moderate: 2 },
      concentration: { topMarketPct: 100, topAssetTypePct: 100, elevatedPlusByMarket: [], highImpactDeteriorations: [] },
      prpi: { prpi_score: 30, prpi_band: "Low", components: { weighted_average_score: 30, pct_exposure_high: 0, pct_exposure_elevated_plus: 0, pct_exposure_deteriorating: 0, top_market_concentration_pct: 100, top_asset_concentration_pct: 100 } },
      dealBadges,
    };
    const pol = policy("Stale cap", [
      { id: "r1", name: "Max 20% stale", type: "MAX_STALE_SCANS_PCT", threshold_pct: 20, enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio,
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    const v = result.violations.find((x) => x.type === "MAX_STALE_SCANS_PCT");
    expect(v).toBeDefined();
    expect(v!.actual_value).toBeGreaterThan(20);
  });

  it("PRPI rule triggered when over threshold", () => {
    const portfolio: PortfolioSummary = {
      ...emptyPortfolio(),
      deals: [
        { id: "d1", name: "D1", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s1", latest_risk_score: 70, latest_risk_band: "High", latest_scanned_at: "2025-01-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
      ],
      counts: { total: 1, scanned: 1, unscanned: 0, stale: 0, needsReview: 0 },
      distributionByBand: { High: 1 },
      concentration: { topMarketPct: 100, topAssetTypePct: 100, elevatedPlusByMarket: [], highImpactDeteriorations: [] },
      prpi: { prpi_score: 60, prpi_band: "Elevated", components: { weighted_average_score: 60, pct_exposure_high: 100, pct_exposure_elevated_plus: 100, pct_exposure_deteriorating: 0, top_market_concentration_pct: 100, top_asset_concentration_pct: 100 } },
      dealBadges: new Map(),
    };
    const pol = policy("PRPI cap", [
      { id: "r1", name: "Max PRPI 55", type: "MAX_PRPI", threshold: 55, enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio,
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    const v = result.violations.find((x) => x.type === "MAX_PRPI");
    expect(v).toBeDefined();
    expect(v!.actual_value).toBe(60);
    expect(v!.threshold_value).toBe(55);
  });

  it("deterioration rule triggered using risk_movement.deal_ids", () => {
    const portfolio: PortfolioSummary = {
      ...emptyPortfolio(),
      deals: [
        { id: "d1", name: "D1", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s1", latest_risk_score: 65, latest_risk_band: "Elevated", latest_scanned_at: "2025-01-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
        { id: "d2", name: "D2", asset_type: "MF", market: "NYC", market_key: "nyc", market_label: "NYC", latest_scan_id: "s2", latest_risk_score: 40, latest_risk_band: "Moderate", latest_scanned_at: "2025-01-01", scan_count: 1, ic_status: null, created_at: "2025-01-01" },
      ],
      counts: { total: 2, scanned: 2, unscanned: 0, stale: 0, needsReview: 0 },
      distributionByBand: { Elevated: 1, Moderate: 1 },
      concentration: { topMarketPct: 100, topAssetTypePct: 100, elevatedPlusByMarket: [], highImpactDeteriorations: [] },
      prpi: { prpi_score: 52, prpi_band: "Moderate", components: { weighted_average_score: 52, pct_exposure_high: 0, pct_exposure_elevated_plus: 50, pct_exposure_deteriorating: 50, top_market_concentration_pct: 100, top_asset_concentration_pct: 100 } },
      risk_movement: { deteriorated: 1, crossed_tiers: 0, version_drift: 0, total_affected: 1, deal_ids: { deteriorated: ["d1"], crossed_tiers: [], version_drift: [] } },
      dealBadges: new Map(),
    };
    const pol = policy("Deterioration cap", [
      { id: "r1", name: "Max 15% deteriorating", type: "MAX_DETERIORATING_PCT", threshold_pct: 15, enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio,
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    const v = result.violations.find((x) => x.type === "MAX_DETERIORATING_PCT");
    expect(v).toBeDefined();
    expect(v!.affected_deal_ids).toContain("d1");
    expect(v!.actual_value).toBe(50); // 1/2 = 50%
  });

  it("invalid rules_json handled safely -> WARN and one violation", () => {
    const pol = policy("Bad policy", "not an array");
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio: emptyPortfolio(),
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    expect(result.violation_count).toBe(1);
    expect(result.violations[0].type).toBe("INVALID_CONFIG");
    expect(result.violations[0].message).toMatch(/invalid|Edit/);
    expect(result.recommended_actions.some((a) => a.code === "EDIT_POLICY")).toBe(true);
  });

  it("invalid rule shape in array returns invalid config", () => {
    const pol = policy("Bad rules", [
      { id: "r1", name: "Bad", type: "UNKNOWN_TYPE", enabled: true, severity: "warn" },
    ]);
    const result = evaluateRiskPolicy({
      policy: pol,
      portfolio: emptyPortfolio(),
      nowIso: "2025-03-01T12:00:00Z",
    });
    expect(result.overall_status).toBe("WARN");
    expect(result.violation_count).toBe(1);
    expect(result.violations[0].type).toBe("INVALID_CONFIG");
  });
});
