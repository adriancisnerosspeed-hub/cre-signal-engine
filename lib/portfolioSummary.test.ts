import { describe, it, expect } from "vitest";
import {
  resolveLatestScanId,
  computePRPI,
  computeVersionDrift,
  getBenchmarkClassification,
  computePortfolioPercentile,
  getPortfolioSummary,
} from "./portfolioSummary";
import { PORTFOLIO_STALE_DAYS } from "./constants";

type ScanRow = {
  id: string;
  deal_id: string;
  created_at: string;
};

describe("resolveLatestScanId (latest-scan invariant)", () => {
  it("uses deal.latest_scan_id when set, even if a newer scan exists by created_at", () => {
    const deal = { id: "deal-1", latest_scan_id: "scan-old" };
    const scansByDealId = new Map<string, ScanRow[]>([
      [
        "deal-1",
        [
          { id: "scan-new", deal_id: "deal-1", created_at: "2025-02-01T12:00:00Z" },
          { id: "scan-old", deal_id: "deal-1", created_at: "2025-01-01T12:00:00Z" },
        ],
      ],
    ]);
    expect(resolveLatestScanId(deal, scansByDealId)).toBe("scan-old");
  });

  it("fallback: when latest_scan_id is null, returns max by (created_at DESC, id DESC)", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>([
      [
        "deal-1",
        [
          { id: "scan-a", deal_id: "deal-1", created_at: "2025-01-02T12:00:00Z" },
          { id: "scan-b", deal_id: "deal-1", created_at: "2025-01-02T12:00:00Z" },
          { id: "scan-c", deal_id: "deal-1", created_at: "2025-01-01T12:00:00Z" },
        ],
      ],
    ]);
    const result = resolveLatestScanId(deal, scansByDealId);
    expect(result).toBe("scan-b");
  });

  it("when latest_scan_id is null and no scans, returns null", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>();
    expect(resolveLatestScanId(deal, scansByDealId)).toBeNull();
  });

  it("when latest_scan_id is null and empty array for deal, returns null", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>([["deal-1", []]]);
    expect(resolveLatestScanId(deal, scansByDealId)).toBeNull();
  });
});

describe("PORTFOLIO_STALE_DAYS constant", () => {
  it("is 30 for stale badge and alerts", () => {
    expect(PORTFOLIO_STALE_DAYS).toBe(30);
  });
});

describe("computePRPI", () => {
  it("returns score 0 and band Low when all inputs are zero", () => {
    const result = computePRPI({
      weightedAvgScore: 0,
      totalWeight: 0,
      highOnlyWeight: 0,
      elevatedPlusWeight: 0,
      deterioratingWeight: 0,
      topMarketPct: 0,
      topAssetPct: 0,
    });
    expect(result.prpi_score).toBe(0);
    expect(result.prpi_band).toBe("Low");
    expect(result.components.pct_exposure_high).toBe(0);
    expect(result.components.pct_exposure_elevated_plus).toBe(0);
    expect(result.components.pct_exposure_deteriorating).toBe(0);
  });

  it("avoids division by zero when totalWeight is 0", () => {
    const result = computePRPI({
      weightedAvgScore: 50,
      totalWeight: 0,
      highOnlyWeight: 0,
      elevatedPlusWeight: 0,
      deterioratingWeight: 0,
      topMarketPct: 80,
      topAssetPct: 60,
    });
    expect(result.prpi_score).toBeGreaterThanOrEqual(0);
    expect(result.prpi_score).toBeLessThanOrEqual(100);
    expect(result.components.pct_exposure_high).toBe(0);
    expect(result.components.pct_exposure_elevated_plus).toBe(0);
    expect(result.components.pct_exposure_deteriorating).toBe(0);
  });

  it("computes bands correctly: 0-30 Low, 31-50 Moderate, 51-70 Elevated, 71+ High", () => {
    const low = computePRPI({
      weightedAvgScore: 20,
      totalWeight: 100,
      highOnlyWeight: 0,
      elevatedPlusWeight: 0,
      deterioratingWeight: 0,
      topMarketPct: 25,
      topAssetPct: 25,
    });
    expect(low.prpi_band).toBe("Low");

    const moderate = computePRPI({
      weightedAvgScore: 40,
      totalWeight: 100,
      highOnlyWeight: 40,
      elevatedPlusWeight: 40,
      deterioratingWeight: 0,
      topMarketPct: 50,
      topAssetPct: 50,
    });
    expect(moderate.prpi_band).toBe("Moderate");

    const elevated = computePRPI({
      weightedAvgScore: 60,
      totalWeight: 100,
      highOnlyWeight: 50,
      elevatedPlusWeight: 60,
      deterioratingWeight: 20,
      topMarketPct: 60,
      topAssetPct: 60,
    });
    expect(elevated.prpi_band).toBe("Elevated");

    const high = computePRPI({
      weightedAvgScore: 80,
      totalWeight: 100,
      highOnlyWeight: 100,
      elevatedPlusWeight: 100,
      deterioratingWeight: 50,
      topMarketPct: 90,
      topAssetPct: 90,
    });
    expect(high.prpi_band).toBe("High");
  });

  it("is deterministic: same inputs yield same score and band", () => {
    const params = {
      weightedAvgScore: 55,
      totalWeight: 1000,
      highOnlyWeight: 200,
      elevatedPlusWeight: 350,
      deterioratingWeight: 80,
      topMarketPct: 45,
      topAssetPct: 38,
    };
    const a = computePRPI(params);
    const b = computePRPI(params);
    expect(a.prpi_score).toBe(b.prpi_score);
    expect(a.prpi_band).toBe(b.prpi_band);
    expect(a.components.pct_exposure_high).toBe(b.components.pct_exposure_high);
    expect(a.components.pct_exposure_deteriorating).toBe(b.components.pct_exposure_deteriorating);
  });

  it("exposes component breakdown with correct pct_exposure_high and pct_exposure_deteriorating", () => {
    const result = computePRPI({
      weightedAvgScore: 50,
      totalWeight: 100,
      highOnlyWeight: 25,
      elevatedPlusWeight: 40,
      deterioratingWeight: 10,
      topMarketPct: 30,
      topAssetPct: 20,
    });
    expect(result.components.weighted_average_score).toBe(50);
    expect(result.components.pct_exposure_high).toBe(25);
    expect(result.components.pct_exposure_elevated_plus).toBe(40);
    expect(result.components.pct_exposure_deteriorating).toBe(10);
    expect(result.components.top_market_concentration_pct).toBe(30);
    expect(result.components.top_asset_concentration_pct).toBe(20);
  });
});

describe("computeVersionDrift", () => {
  it("returns no drift when all versions are null or empty", () => {
    const deals = [
      { id: "d1", risk_index_version: null as string | null },
      { id: "d2", risk_index_version: "" },
      { id: "d3", risk_index_version: "  " },
    ];
    const { versionDrift, versionDriftDealIds } = computeVersionDrift(deals);
    expect(versionDrift).toBe(false);
    expect(versionDriftDealIds).toEqual([]);
  });

  it("returns no drift when only one distinct non-empty version (mixed with nulls)", () => {
    const deals = [
      { id: "d1", risk_index_version: "2.0" },
      { id: "d2", risk_index_version: null as string | null },
      { id: "d3", risk_index_version: "2.0" },
    ];
    const { versionDrift, versionDriftDealIds } = computeVersionDrift(deals);
    expect(versionDrift).toBe(false);
    expect(versionDriftDealIds).toEqual([]);
  });

  it("flags drift when two distinct non-empty versions exist", () => {
    const deals = [
      { id: "d1", risk_index_version: "2.0" },
      { id: "d2", risk_index_version: "1.0" },
      { id: "d3", risk_index_version: "2.0" },
    ];
    const { versionDrift, versionDriftDealIds } = computeVersionDrift(deals);
    expect(versionDrift).toBe(true);
    expect(versionDriftDealIds).toContain("d2");
    expect(versionDriftDealIds).not.toContain("d1");
    expect(versionDriftDealIds).not.toContain("d3");
  });

  it("does not flag deals with null/empty version as drift (only non-majority non-empty)", () => {
    const deals = [
      { id: "d1", risk_index_version: "2.0" },
      { id: "d2", risk_index_version: "1.0" },
      { id: "d3", risk_index_version: null as string | null },
      { id: "d4", risk_index_version: "" },
    ];
    const { versionDrift, versionDriftDealIds } = computeVersionDrift(deals);
    expect(versionDrift).toBe(true);
    expect(versionDriftDealIds).toContain("d2");
    expect(versionDriftDealIds).not.toContain("d3");
    expect(versionDriftDealIds).not.toContain("d4");
  });

  it("returns no drift for empty array", () => {
    const { versionDrift, versionDriftDealIds } = computeVersionDrift([]);
    expect(versionDrift).toBe(false);
    expect(versionDriftDealIds).toEqual([]);
  });
});

describe("getBenchmarkClassification", () => {
  it("returns Conservative when PRPI < 30 and pct_high < 10", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 25, components: { pct_exposure_high: 5 } },
      concentration: { topMarketPct: 20 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 10 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Conservative");
  });

  it("returns Moderate when PRPI 30–50", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 40, components: { pct_exposure_high: 15 } },
      concentration: { topMarketPct: 30 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 20 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Moderate");
  });

  it("returns Aggressive when PRPI > 50 and pct_elevated_plus > 25", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 60, components: { pct_exposure_high: 20 } },
      concentration: { topMarketPct: 35 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 30 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Aggressive");
  });

  it("returns Concentrated when top_market_pct > 40", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 55, components: { pct_exposure_high: 15 } },
      concentration: { topMarketPct: 45 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 30 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Concentrated");
  });

  it("returns Deteriorating when deteriorated / total > 15%", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 50, components: { pct_exposure_high: 10 } },
      concentration: { topMarketPct: 30 },
      trendSummary: { deteriorations: [{}, {}, {}] },
      weightedMetrics: { pctElevatedPlusByWeight: 20 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Deteriorating");
  });

  it("priority: Deteriorating beats Concentrated", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 60, components: { pct_exposure_high: 20 } },
      concentration: { topMarketPct: 50 },
      trendSummary: { deteriorations: [{}, {}] },
      weightedMetrics: { pctElevatedPlusByWeight: 30 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Deteriorating");
  });

  it("priority: Concentrated beats Aggressive", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 55, components: { pct_exposure_high: 15 } },
      concentration: { topMarketPct: 45 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 30 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Concentrated");
  });

  it("defaults to Moderate when no rule matches", () => {
    const summary = {
      counts: { total: 10 },
      prpi: { prpi_score: 55, components: { pct_exposure_high: 15 } },
      concentration: { topMarketPct: 35 },
      trendSummary: { deteriorations: [] },
      weightedMetrics: { pctElevatedPlusByWeight: 20 },
    };
    expect(getBenchmarkClassification(summary as never)).toBe("Moderate");
  });
});

describe("computePortfolioPercentile", () => {
  it("returns 50 when only one org in cohort", async () => {
    const mockService = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ data: [{ id: "org-1" }] }),
        }),
      }),
    };
    const pct = await computePortfolioPercentile(mockService as never, "org-1", 40);
    expect(pct).toBe(50);
  });

  it("returns 50 when no orgs (v1 fallback)", async () => {
    const mockService = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const pct = await computePortfolioPercentile(mockService as never, "org-1", 40);
    expect(pct).toBe(50);
  });
});

describe("getPortfolioSummary return shape", () => {
  it("risk_movement and highImpactDealIds are always defined (empty org)", async () => {
    const mockService = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const summary = await getPortfolioSummary(mockService as never, "org-1");
    expect(summary.risk_movement).toBeDefined();
    expect(summary.risk_movement?.deal_ids).toBeDefined();
    expect(Array.isArray(summary.risk_movement?.deal_ids?.deteriorated)).toBe(true);
    expect(Array.isArray(summary.risk_movement?.deal_ids?.crossed_tiers)).toBe(true);
    expect(Array.isArray(summary.risk_movement?.deal_ids?.version_drift)).toBe(true);
    expect(summary.highImpactDealIds).toBeDefined();
    expect(Array.isArray(summary.highImpactDealIds)).toBe(true);
  });

  it("includes benchmark when benchmarkEnabled is true (empty org → classification still set)", async () => {
    const mockService = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [] }),
          in: () => Promise.resolve({ data: [] }),
          not: () => ({ eq: () => Promise.resolve({ data: [] }) }),
          order: () => Promise.resolve({ data: [] }),
          gt: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const summary = await getPortfolioSummary(mockService as never, "org-1", {
      benchmarkEnabled: true,
    });
    expect(summary.benchmark).toBeDefined();
    expect(summary.benchmark?.cohort_type).toBe("internal");
    expect(summary.benchmark?.percentile_rank).toBe(50);
    expect(["Conservative", "Moderate", "Aggressive", "Concentrated", "Deteriorating"]).toContain(
      summary.benchmark?.classification
    );
  });

  it("omits benchmark when benchmarkEnabled is false", async () => {
    const mockService = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const summary = await getPortfolioSummary(mockService as never, "org-1");
    expect(summary.benchmark).toBeUndefined();
  });
});
