/**
 * Server-side portfolio intelligence: batched queries, latest-scan invariant,
 * weighted metrics, badges, alerts, explainability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTFOLIO_STALE_DAYS } from "./constants";
import { exposureMarketKey, exposureMarketLabel } from "./normalizeMarket";
import { computeRiskPenaltyContribution, describeStabilizers } from "./riskIndex";
import type { DealScanAssumptions } from "./dealScanContract";
import { computeBacktestMetrics, type BacktestMetrics } from "./backtestEngine";
import { getRiskModelMetadata } from "./modelGovernance";

export type IcStatusValue = "PRE_IC" | "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED";

export type DealRow = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  market_key: string | null;
  market_label: string | null;
  latest_scan_id: string | null;
  latest_risk_score: number | null;
  latest_risk_band: string | null;
  latest_scanned_at: string | null;
  scan_count: number;
  ic_status: IcStatusValue | null;
  created_at: string;
};

export type IcPerformanceSummary = {
  pctHighDealsApproved: number;
  pctElevatedDealsRejected: number;
  approvalRateByBand: Record<string, { decided: number; approved: number; ratePct: number }>;
};

export type ScanRow = {
  id: string;
  deal_id: string;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_breakdown: unknown;
  risk_index_version: string | null;
  macro_linked_count: number | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  completed_at: string | null;
  extraction: unknown;
};

export type DealWithScore = DealRow & {
  risk_index_score: number;
  risk_index_band: string | null;
  risk_index_version: string | null;
};

export type Badge = "unscanned" | "stale" | "needs_review";

export type RecurringRisk = {
  risk_type: string;
  deal_count: number;
  weighted_score: number;
};

export type AlertItem = {
  type: "tier_change" | "score_increase" | "stale_scan" | "missing_input" | "unscanned_count" | "high_impact_risk" | "version_drift";
  dealId?: string;
  dealName?: string;
  message: string;
};

export type DealExplainability = {
  topRiskContributors: { risk_type: string; penalty: number }[];
  stabilizers: string[];
};

export type WeightedMetrics = {
  pctElevatedPlusByCount: number;
  pctElevatedPlusByWeight: number;
  weightedAvgScore: number;
  hasWeightData: boolean;
};

export type PortfolioConcentration = {
  topMarketPct: number;
  topAssetTypePct: number;
  elevatedPlusByMarket: { market_key: string; elevatedPlusCount: number }[];
  highImpactDeteriorations: { dealId: string; dealName: string; delta: number; latestScore: number; previousScore: number }[];
};

export type PRPIComponents = {
  weighted_average_score: number;
  pct_exposure_high: number;
  pct_exposure_elevated_plus: number;
  pct_exposure_deteriorating: number;
  top_market_concentration_pct: number;
  top_asset_concentration_pct: number;
};

export type PRPIBand = "Low" | "Moderate" | "Elevated" | "High";

export type PRPIResult = {
  prpi_score: number;
  prpi_band: PRPIBand;
  components: PRPIComponents;
};

export type RiskMovement = {
  deteriorated: number;
  crossed_tiers: number;
  version_drift: number;
  total_affected: number;
  deal_ids?: {
    deteriorated: string[];
    crossed_tiers: string[];
    version_drift: string[];
  };
};

export type PortfolioSummary = {
  deals: DealRow[];
  counts: { total: number; scanned: number; unscanned: number; stale: number; needsReview: number };
  distributionByBand: Record<string, number>;
  exposureByAsset: Record<string, { total: number; scanned: number }>;
  exposureByMarket: Record<string, { label: string; total: number; scanned: number }>;
  topDealsByScore: DealWithScore[];
  recurringRisks: RecurringRisk[];
  riskComposition: { structuralPct: number; marketPct: number };
  macroExposure: { category: string; dealCount: number }[];
  trendSummary: {
    deteriorations: { dealId: string; dealName: string; delta: number; latestScore: number; previousScore: number; deltaComparable?: boolean }[];
    bandTransitions: { dealId: string; dealName: string; fromBand: string; toBand: string }[];
  };
  alerts: AlertItem[];
  dealBadges: Map<string, Badge[]>;
  dealExplainability: Map<string, DealExplainability>;
  weightedMetrics: WeightedMetrics;
  versionDrift?: boolean;
  concentration?: PortfolioConcentration;
  prpi?: PRPIResult;
  risk_movement?: RiskMovement;
  backtest_summary?: BacktestMetrics;
  ic_performance_summary?: IcPerformanceSummary;
  highImpactDealIds?: string[];
  /** Model health & governance card (institutional transparency). */
  model_health?: {
    model_version: string;
    weighted_avg_score: number;
    distribution_by_band: Record<string, number>;
    pct_high: number;
    pct_elevated: number;
    stress_last_run_at?: string;
    governance_locked_at: string;
  };
};

const ELEVATED_PLUS_BANDS = new Set<string>(["Elevated", "High"]);

const BAND_ORDER: Record<string, number> = { Low: 0, Moderate: 1, Elevated: 2, High: 3 };
function bandWorsened(fromBand: string, toBand: string): boolean {
  const from = BAND_ORDER[fromBand] ?? -1;
  const to = BAND_ORDER[toBand] ?? -1;
  return to > from;
}

const PRPI_BAND_THRESHOLDS: { max: number; band: PRPIBand }[] = [
  { max: 30, band: "Low" },
  { max: 50, band: "Moderate" },
  { max: 70, band: "Elevated" },
  { max: 100, band: "High" },
];

function getPRPIBand(score: number): PRPIBand {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const { max, band } of PRPI_BAND_THRESHOLDS) {
    if (clamped <= max) return band;
  }
  return "High";
}

export function computePRPI(params: {
  weightedAvgScore: number;
  totalWeight: number;
  highOnlyWeight: number;
  elevatedPlusWeight: number;
  deterioratingWeight: number;
  topMarketPct: number;
  topAssetPct: number;
}): PRPIResult {
  const {
    weightedAvgScore,
    totalWeight,
    highOnlyWeight,
    elevatedPlusWeight,
    deterioratingWeight,
    topMarketPct,
    topAssetPct,
  } = params;

  const pct_exposure_high = totalWeight > 0 ? (highOnlyWeight / totalWeight) * 100 : 0;
  const pct_exposure_elevated_plus = totalWeight > 0 ? (elevatedPlusWeight / totalWeight) * 100 : 0;
  const pct_exposure_deteriorating = totalWeight > 0 ? (deterioratingWeight / totalWeight) * 100 : 0;

  const normWeighted = Math.min(1, Math.max(0, weightedAvgScore / 100));
  const normHigh = Math.min(1, pct_exposure_high / 100);
  const normDeteriorating = Math.min(1, pct_exposure_deteriorating / 100);
  const normMarket = Math.min(1, topMarketPct / 100);
  const normAsset = Math.min(1, topAssetPct / 100);

  const raw =
    0.3 * normWeighted +
    0.25 * normHigh +
    0.15 * normDeteriorating +
    0.15 * normMarket +
    0.15 * normAsset;
  const prpi_score = Math.max(0, Math.min(100, Math.round(raw * 100)));

  return {
    prpi_score,
    prpi_band: getPRPIBand(prpi_score),
    components: {
      weighted_average_score: weightedAvgScore,
      pct_exposure_high,
      pct_exposure_elevated_plus,
      pct_exposure_deteriorating,
      top_market_concentration_pct: topMarketPct,
      top_asset_concentration_pct: topAssetPct,
    },
  };
}

/**
 * Version drift: treat null/empty as unknown; majority among non-empty only.
 * Only flag drift when there are at least two distinct non-empty versions.
 * Deals with null/empty version are not counted as "in drift".
 */
export function computeVersionDrift(dealsWithVersion: { id: string; risk_index_version: string | null }[]): {
  versionDrift: boolean;
  versionDriftDealIds: string[];
} {
  const nonEmptyVersions = new Set(
    dealsWithVersion.map((d) => (d.risk_index_version ?? "").trim()).filter((v) => v !== "")
  );
  const versionDrift = nonEmptyVersions.size >= 2;
  if (!versionDrift || dealsWithVersion.length === 0) {
    return { versionDrift: false, versionDriftDealIds: [] };
  }
  const versionCounts: Record<string, number> = {};
  for (const d of dealsWithVersion) {
    const v = (d.risk_index_version ?? "").trim();
    if (v === "") continue;
    versionCounts[v] = (versionCounts[v] ?? 0) + 1;
  }
  const majorityVersion = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const versionDriftDealIds: string[] = [];
  for (const d of dealsWithVersion) {
    const v = (d.risk_index_version ?? "").trim();
    if (v !== "" && v !== majorityVersion) versionDriftDealIds.push(d.id);
  }
  return { versionDrift: true, versionDriftDealIds };
}

function parseExtractionAssumptions(extraction: unknown): DealScanAssumptions | undefined {
  if (!extraction || typeof extraction !== "object" || !("assumptions" in extraction)) return undefined;
  const a = (extraction as { assumptions?: unknown }).assumptions;
  return a && typeof a === "object" ? (a as DealScanAssumptions) : undefined;
}

/** Exposure weight: purchase_price from scan extraction if present and > 0, else 1. */
function getExposureWeight(scanExtraction: unknown): number {
  const assumptions = parseExtractionAssumptions(scanExtraction);
  if (!assumptions?.purchase_price) return 1;
  const v = assumptions.purchase_price.value;
  return typeof v === "number" && v > 0 ? v : 1;
}

/**
 * 80th percentile of purchase_price from latest scans in org (for exposure_bucket).
 */
export async function getPortfolioPurchasePriceP80(
  service: SupabaseClient,
  orgId: string
): Promise<number | null> {
  const { data: deals } = await service
    .from("deals")
    .select("id, latest_scan_id")
    .eq("organization_id", orgId);
  const scanIds = (deals ?? [])
    .map((d: { latest_scan_id?: string | null }) => d.latest_scan_id)
    .filter((id): id is string => !!id);
  if (scanIds.length === 0) return null;
  const { data: scans } = await service
    .from("deal_scans")
    .select("id, extraction")
    .in("id", scanIds)
    .eq("status", "completed");
  const prices: number[] = [];
  for (const s of scans ?? []) {
    const ext = (s as { extraction?: unknown }).extraction;
    const assumptions = parseExtractionAssumptions(ext);
    const v = assumptions?.purchase_price?.value;
    if (typeof v === "number" && v > 0) prices.push(v);
  }
  if (prices.length === 0) return null;
  prices.sort((a, b) => a - b);
  const idx = Math.ceil(prices.length * 0.8) - 1;
  return prices[Math.max(0, idx)];
}

/**
 * Resolve latest scan id: if deal.latest_scan_id is set, use it; else fallback to
 * max by (created_at DESC, id DESC) from scans for that deal.
 */
export function resolveLatestScanId(
  deal: { id: string; latest_scan_id: string | null },
  scansByDealId: Map<string, ScanRow[]>
): string | null {
  if (deal.latest_scan_id) return deal.latest_scan_id;
  const scans = scansByDealId.get(deal.id);
  if (!scans?.length) return null;
  const sorted = [...scans].sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    if (tB !== tA) return tB - tA;
    return b.id.localeCompare(a.id);
  });
  return sorted[0].id;
}

export async function getPortfolioSummary(
  service: SupabaseClient,
  orgId: string
): Promise<PortfolioSummary> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - PORTFOLIO_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1. All deals
  const { data: dealsList } = await service
    .from("deals")
    .select(
      "id, name, asset_type, market, market_key, market_label, latest_scan_id, latest_risk_score, latest_risk_band, latest_scanned_at, scan_count, ic_status, created_at"
    )
    .eq("organization_id", orgId);

  const deals = (dealsList ?? []) as DealRow[];

  if (deals.length === 0) {
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
      concentration: {
        topMarketPct: 0,
        topAssetTypePct: 0,
        elevatedPlusByMarket: [],
        highImpactDeteriorations: [],
      },
      prpi: {
        prpi_score: 0,
        prpi_band: "Low",
        components: {
          weighted_average_score: 0,
          pct_exposure_high: 0,
          pct_exposure_elevated_plus: 0,
          pct_exposure_deteriorating: 0,
          top_market_concentration_pct: 0,
          top_asset_concentration_pct: 0,
        },
      },
      ic_performance_summary: {
        pctHighDealsApproved: 0,
        pctElevatedDealsRejected: 0,
        approvalRateByBand: {},
      },
      risk_movement: {
        deteriorated: 0,
        crossed_tiers: 0,
        version_drift: 0,
        total_affected: 0,
        deal_ids: { deteriorated: [], crossed_tiers: [], version_drift: [] },
      },
      highImpactDealIds: [],
      model_health: (() => {
        const meta = getRiskModelMetadata();
        return {
          model_version: meta.version,
          weighted_avg_score: 0,
          distribution_by_band: {} as Record<string, number>,
          pct_high: 0,
          pct_elevated: 0,
          governance_locked_at: meta.created_at,
        };
      })(),
    };
  }

  const dealIds = deals.map((d) => d.id);

  // Backtest: scans with actual outcomes (for calibration metrics when sample >= 20)
  const { data: backtestRows } = await service
    .from("deal_scans")
    .select("deal_id, risk_index_score, risk_index_band, actual_outcome_type, actual_outcome_value")
    .in("deal_id", dealIds)
    .not("actual_outcome_type", "is", null)
    .eq("status", "completed");
  const backtestScans = (backtestRows ?? []) as { risk_index_score: number | null; risk_index_band: string | null; actual_outcome_type: string | null; actual_outcome_value: number | null }[];
  const backtestResult = computeBacktestMetrics(backtestScans);

  // 2. All scans for these deals (for fallback + previous scan)
  const { data: allScans } = await service
    .from("deal_scans")
    .select(
      "id, deal_id, risk_index_score, risk_index_band, risk_index_breakdown, risk_index_version, macro_linked_count, model, prompt_version, created_at, completed_at, extraction"
    )
    .in("deal_id", dealIds)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const scans = (allScans ?? []) as ScanRow[];
  const scansByDealId = new Map<string, ScanRow[]>();
  for (const s of scans) {
    const list = scansByDealId.get(s.deal_id) ?? [];
    list.push(s);
    scansByDealId.set(s.deal_id, list);
  }

  const latestScanIds = new Set<string>();
  const dealToLatestScan = new Map<string, ScanRow>();
  for (const d of deals) {
    const lid = resolveLatestScanId(d, scansByDealId);
    if (lid) {
      latestScanIds.add(lid);
      const scan = scans.find((s) => s.id === lid);
      if (scan) dealToLatestScan.set(d.id, scan);
    }
  }

  const latestScanIdList = [...latestScanIds];

  // 3. Deal risks for latest scans
  let riskRows: { id: string; deal_scan_id: string; risk_type: string; severity_current: string; confidence: string | null }[] = [];
  if (latestScanIdList.length > 0) {
    const { data: risks } = await service
      .from("deal_risks")
      .select("id, deal_scan_id, risk_type, severity_current, confidence")
      .in("deal_scan_id", latestScanIdList);
    riskRows = (risks ?? []) as typeof riskRows;
  }

  const riskIds = riskRows.map((r) => r.id);
  const risksByScanId = new Map<string, typeof riskRows>();
  for (const r of riskRows) {
    const list = risksByScanId.get(r.deal_scan_id) ?? [];
    list.push(r);
    risksByScanId.set(r.deal_scan_id, list);
  }

  // 4. Macro links + signals (for macro exposure)
  let linkRows: { deal_risk_id: string; signal_id: string }[] = [];
  let signalTypesBySignalId: Record<string, string> = {};
  if (riskIds.length > 0) {
    const { data: links } = await service
      .from("deal_signal_links")
      .select("deal_risk_id, signal_id")
      .in("deal_risk_id", riskIds);
    linkRows = (links ?? []) as typeof linkRows;
    const sigIds = [...new Set(linkRows.map((l) => l.signal_id))];
    if (sigIds.length > 0) {
      const { data: signalRows } = await service
        .from("signals")
        .select("id, signal_type")
        .in("id", sigIds);
      for (const s of (signalRows ?? []) as { id: string; signal_type: string | null }[]) {
        signalTypesBySignalId[String(s.id)] = (s.signal_type ?? "").trim().toLowerCase();
      }
    }
  }

  // Previous scan per deal (for trend)
  const previousScanByDealId = new Map<string, ScanRow>();
  for (const [dealId, list] of scansByDealId) {
    const latestScan = dealToLatestScan.get(dealId);
    if (!latestScan) continue;
    const others = list.filter((s) => s.id !== latestScan.id);
    if (others.length === 0) continue;
    const sorted = [...others].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tB !== tA) return tB - tA;
      return b.id.localeCompare(a.id);
    });
    previousScanByDealId.set(dealId, sorted[0]);
  }

  const distributionByBand: Record<string, number> = {};
  const exposureByAsset: Record<string, { total: number; scanned: number }> = {};
  const exposureByMarket: Record<string, { label: string; total: number; scanned: number }> = {};
  const dealBadges = new Map<string, Badge[]>();
  const dealExplainability = new Map<string, DealExplainability>();
  const recurringRiskAgg: Record<string, { count: number; totalPenalty: number }> = {};
  let structuralTotal = 0;
  let marketTotal = 0;
  const macroCategoryDealIds = new Map<string, Set<string>>();
  const deteriorations: PortfolioSummary["trendSummary"]["deteriorations"] = [];
  const bandTransitions: PortfolioSummary["trendSummary"]["bandTransitions"] = [];
  const deterioratedDealIds = new Set<string>();
  const highImpactDealIds = new Set<string>();
  const alerts: AlertItem[] = [];
  const withScore: DealWithScore[] = [];
  let sumWeight = 0;
  let sumScoreWeight = 0;
  let elevatedPlusCount = 0;
  let elevatedPlusWeight = 0;
  let highOnlyWeight = 0;
  let hasWeightData = false;

  for (const d of deals) {
    const latestScan = dealToLatestScan.get(d.id);
    const badges: Badge[] = [];
    if (!latestScan) {
      badges.push("unscanned");
      dealBadges.set(d.id, badges);
      const at = d.asset_type ?? "Unspecified";
      exposureByAsset[at] = exposureByAsset[at] ?? { total: 0, scanned: 0 };
      exposureByAsset[at].total += 1;
      const mk = d.market_key ?? exposureMarketKey(d);
      const label = d.market_label ?? exposureMarketLabel(d);
      if (!exposureByMarket[mk]) exposureByMarket[mk] = { label, total: 0, scanned: 0 };
      exposureByMarket[mk].total += 1;
      continue;
    }

    const score = latestScan.risk_index_score;
    const band = latestScan.risk_index_band ?? "—";
    if (score != null) {
      const weight = getExposureWeight(latestScan.extraction);
      if (weight > 1) hasWeightData = true;
      sumWeight += weight;
      sumScoreWeight += score * weight;
      if (ELEVATED_PLUS_BANDS.has(band)) {
        elevatedPlusCount += 1;
        elevatedPlusWeight += weight;
      }
      if (band === "High") {
        highOnlyWeight += weight;
      }
      withScore.push({
        ...d,
        risk_index_score: score,
        risk_index_band: band,
        risk_index_version: latestScan.risk_index_version,
      });
      distributionByBand[band] = (distributionByBand[band] ?? 0) + 1;
    }

    const scannedAt = latestScan.completed_at ?? latestScan.created_at;
    if (scannedAt && scannedAt < staleCutoff) badges.push("stale");

    const previousScan = previousScanByDealId.get(d.id);
    if (previousScan && score != null) {
      const prevScore = previousScan.risk_index_score;
      const prevBand = previousScan.risk_index_band ?? "—";
      if (prevScore != null) {
        const delta = score - prevScore;
        if (band !== prevBand) {
          bandTransitions.push({
            dealId: d.id,
            dealName: d.name,
            fromBand: prevBand,
            toBand: band,
          });
          if (bandWorsened(prevBand, band)) badges.push("needs_review");
        }
        if (delta >= 8) {
          badges.push("needs_review");
          const breakdown = latestScan.risk_index_breakdown as { delta_comparable?: boolean } | null;
          const deltaComparable = breakdown?.delta_comparable === true;
          deteriorations.push({
            dealId: d.id,
            dealName: d.name,
            delta,
            latestScore: score,
            previousScore: prevScore,
            deltaComparable,
          });
          if (deltaComparable) deterioratedDealIds.add(d.id);
        }
      }
    }

    dealBadges.set(d.id, badges);

    const at = d.asset_type ?? "Unspecified";
    exposureByAsset[at] = exposureByAsset[at] ?? { total: 0, scanned: 0 };
    exposureByAsset[at].total += 1;
    exposureByAsset[at].scanned += 1;
    const mk = d.market_key ?? exposureMarketKey(d);
    const label = d.market_label ?? exposureMarketLabel(d);
    if (!exposureByMarket[mk]) exposureByMarket[mk] = { label, total: 0, scanned: 0 };
    exposureByMarket[mk].total += 1;
    exposureByMarket[mk].scanned += 1;

    const risks = risksByScanId.get(latestScan.id) ?? [];
    const assumptions = parseExtractionAssumptions(latestScan.extraction);
    const contributions = risks.map((r) => ({
      risk_type: r.risk_type,
      penalty: computeRiskPenaltyContribution(r, assumptions),
    }));
    contributions.sort((a, b) => b.penalty - a.penalty);
    const topRiskContributors = contributions.slice(0, 3).map(({ risk_type, penalty }) => ({ risk_type, penalty }));
    const stabilizers = describeStabilizers(assumptions);
    dealExplainability.set(d.id, { topRiskContributors, stabilizers });

    for (const r of risks) {
      const key = r.risk_type;
      const agg = recurringRiskAgg[key] ?? { count: 0, totalPenalty: 0 };
      agg.count += 1;
      agg.totalPenalty += computeRiskPenaltyContribution(r, assumptions);
      recurringRiskAgg[key] = agg;
    }

    const riskBreakdown = latestScan.risk_index_breakdown as {
      structural_weight?: number;
      market_weight?: number;
      exposure_bucket?: string;
      alert_tags?: string[];
    } | null;
    if (riskBreakdown) {
      structuralTotal += riskBreakdown.structural_weight ?? 0;
      marketTotal += riskBreakdown.market_weight ?? 0;
      if (ELEVATED_PLUS_BANDS.has(band) && riskBreakdown.exposure_bucket === "High") {
        alerts.push({
          type: "high_impact_risk",
          dealId: d.id,
          dealName: d.name,
          message: "High exposure and Elevated/High risk band",
        });
      }
      if (riskBreakdown.alert_tags?.includes("HIGH_IMPACT_RISK")) {
        highImpactDealIds.add(d.id);
      }
    }

    for (const link of linkRows) {
      const risk = riskRows.find((x) => x.id === link.deal_risk_id);
      if (!risk || risk.deal_scan_id !== latestScan.id) continue;
      const cat = signalTypesBySignalId[link.signal_id] || "other";
      let set = macroCategoryDealIds.get(cat);
      if (!set) {
        set = new Set();
        macroCategoryDealIds.set(cat, set);
      }
      set.add(d.id);
    }
  }

  deteriorations.sort((a, b) => b.delta - a.delta);
  const topDeteriorations = deteriorations.slice(0, 5);

  let deterioratingWeight = 0;
  for (const det of deteriorations) {
    if (det.deltaComparable !== true) continue;
    const scan = dealToLatestScan.get(det.dealId);
    if (!scan) continue;
    deterioratingWeight += getExposureWeight(scan.extraction);
  }

  const recurringRisks: RecurringRisk[] = Object.entries(recurringRiskAgg).map(([risk_type, { count, totalPenalty }]) => ({
    risk_type,
    deal_count: count,
    weighted_score: totalPenalty,
  }));
  recurringRisks.sort((a, b) => b.deal_count - a.deal_count);

  const totalWeight = sumWeight || 1;
  const weightedMetrics: WeightedMetrics = {
    pctElevatedPlusByCount: withScore.length ? (elevatedPlusCount / withScore.length) * 100 : 0,
    pctElevatedPlusByWeight: sumWeight ? (elevatedPlusWeight / sumWeight) * 100 : 0,
    weightedAvgScore: sumWeight ? sumScoreWeight / totalWeight : 0,
    hasWeightData,
  };

  const rcTotal = structuralTotal + marketTotal || 1;
  const riskComposition = {
    structuralPct: Math.round((structuralTotal / rcTotal) * 100),
    marketPct: Math.round((marketTotal / rcTotal) * 100),
  };

  const macroExposure = [...macroCategoryDealIds.entries()]
    .filter(([cat]) => cat && cat !== "other")
    .map(([category, set]) => ({ category, dealCount: set.size }))
    .sort((a, b) => b.dealCount - a.dealCount);

  const topDealsByScore = [...withScore].sort((a, b) => b.risk_index_score - a.risk_index_score).slice(0, 5);

  const { versionDrift, versionDriftDealIds: versionDriftDealIdsList } = computeVersionDrift(withScore);
  if (versionDrift) {
    alerts.push({ type: "version_drift", message: "Mixed scoring versions in portfolio." });
  }
  const versionDriftDealIds = new Set(versionDriftDealIdsList);

  const crossedTierDealIds = new Set(bandTransitions.map((t) => t.dealId));
  const totalAffected = new Set([...deterioratedDealIds, ...crossedTierDealIds, ...versionDriftDealIds]).size;
  const risk_movement: RiskMovement = {
    deteriorated: deterioratedDealIds.size,
    crossed_tiers: crossedTierDealIds.size,
    version_drift: versionDriftDealIds.size,
    total_affected: totalAffected,
    deal_ids: {
      deteriorated: [...deterioratedDealIds],
      crossed_tiers: [...crossedTierDealIds],
      version_drift: [...versionDriftDealIds],
    },
  };

  const totalDeals = deals.length || 1;
  const maxMarketTotal = Math.max(0, ...Object.values(exposureByMarket).map((x) => x.total));
  const maxAssetTotal = Math.max(0, ...Object.values(exposureByAsset).map((x) => x.total));
  const elevatedPlusByMarket: { market_key: string; elevatedPlusCount: number }[] = [];
  const elevatedByMarketAgg = new Map<string, number>();
  for (const d of withScore) {
    if (!ELEVATED_PLUS_BANDS.has(d.risk_index_band ?? "")) continue;
    const mk = d.market_key ?? exposureMarketKey(d);
    elevatedByMarketAgg.set(mk, (elevatedByMarketAgg.get(mk) ?? 0) + 1);
  }
  for (const [market_key, elevatedPlusCount] of elevatedByMarketAgg) {
    elevatedPlusByMarket.push({ market_key, elevatedPlusCount });
  }
  elevatedPlusByMarket.sort((a, b) => b.elevatedPlusCount - a.elevatedPlusCount);

  let highImpactDeteriorations: PortfolioConcentration["highImpactDeteriorations"] = [];
  try {
    const p80 = await getPortfolioPurchasePriceP80(service, orgId);
    if (p80 != null) {
      for (const det of topDeteriorations) {
        const scan = dealToLatestScan.get(det.dealId);
        if (!scan) continue;
        const weight = getExposureWeight(scan.extraction);
        if (weight >= p80) highImpactDeteriorations.push(det);
      }
    }
  } catch {
    // optional
  }

  const concentration: PortfolioConcentration = {
    topMarketPct: Math.round((maxMarketTotal / totalDeals) * 100),
    topAssetTypePct: Math.round((maxAssetTotal / totalDeals) * 100),
    elevatedPlusByMarket,
    highImpactDeteriorations,
  };

  const prpi = computePRPI({
    weightedAvgScore: weightedMetrics.weightedAvgScore,
    totalWeight: sumWeight,
    highOnlyWeight,
    elevatedPlusWeight,
    deterioratingWeight,
    topMarketPct: concentration.topMarketPct,
    topAssetPct: concentration.topAssetTypePct,
  });

  let needsReviewCount = 0;
  let staleCount = 0;
  dealBadges.forEach((b) => {
    if (b.includes("needs_review")) needsReviewCount += 1;
    if (b.includes("stale")) staleCount += 1;
  });
  const   unscannedCount = deals.filter((d) => !dealToLatestScan.has(d.id)).length;

  // IC performance: % High approved, % Elevated rejected, approval rate by band (from deal band + ic_status only)
  const APPROVED_STATUSES = new Set<IcStatusValue>(["APPROVED", "APPROVED_WITH_CONDITIONS"]);
  const bandsForIc = ["Low", "Moderate", "Elevated", "High"] as const;
  const approvalByBand: Record<string, { decided: number; approved: number; ratePct: number }> = {};
  for (const band of bandsForIc) {
    approvalByBand[band] = { decided: 0, approved: 0, ratePct: 0 };
  }
  let highCount = 0;
  let highApproved = 0;
  let elevatedCount = 0;
  let elevatedRejected = 0;
  for (const d of deals) {
    const band = d.latest_risk_band ?? null;
    if (!band || !bandsForIc.includes(band as (typeof bandsForIc)[number])) continue;
    const status = d.ic_status;
    const decided = status != null && status !== "PRE_IC";
    const approved = status != null && APPROVED_STATUSES.has(status);
    approvalByBand[band].decided += decided ? 1 : 0;
    approvalByBand[band].approved += approved ? 1 : 0;
    if (band === "High") {
      highCount += 1;
      if (approved) highApproved += 1;
    }
    if (band === "Elevated") {
      elevatedCount += 1;
      if (status === "REJECTED") elevatedRejected += 1;
    }
  }
  for (const band of bandsForIc) {
    const row = approvalByBand[band];
    row.ratePct = row.decided > 0 ? Math.round((row.approved / row.decided) * 100) : 0;
  }
  const ic_performance_summary: IcPerformanceSummary = {
    pctHighDealsApproved: highCount > 0 ? Math.round((highApproved / highCount) * 100) : 0,
    pctElevatedDealsRejected: elevatedCount > 0 ? Math.round((elevatedRejected / elevatedCount) * 100) : 0,
    approvalRateByBand: approvalByBand,
  };

  if (unscannedCount > 0) {
    alerts.push({ type: "unscanned_count", message: `${unscannedCount} deal(s) unscanned` });
  }
  for (const t of bandTransitions) {
    alerts.push({
      type: "tier_change",
      dealId: t.dealId,
      dealName: t.dealName,
      message: `Tier changed: ${t.fromBand} → ${t.toBand}`,
    });
  }
  for (const d of topDeteriorations) {
    const message =
      d.deltaComparable === false
        ? "Version drift — delta not comparable"
        : `Score +${d.delta} (${d.previousScore} → ${d.latestScore})`;
    alerts.push({
      type: "score_increase",
      dealId: d.dealId,
      dealName: d.dealName,
      message,
    });
  }
  for (const d of deals) {
    const badges = dealBadges.get(d.id) ?? [];
    if (badges.includes("stale")) {
      alerts.push({
        type: "stale_scan",
        dealId: d.id,
        dealName: d.name,
        message: "Scan is over 30 days old",
      });
    }
    const scan = dealToLatestScan.get(d.id);
    if (scan) {
      const assumptions = parseExtractionAssumptions(scan.extraction);
      const hasExpenseGrowth = assumptions?.expense_growth?.value != null;
      const hasDebtRate = assumptions?.debt_rate?.value != null;
      if (!hasExpenseGrowth || !hasDebtRate) {
        alerts.push({
          type: "missing_input",
          dealId: d.id,
          dealName: d.name,
          message: "Missing critical inputs (expense_growth or debt_rate)",
        });
      }
    }
  }

  const metadata = getRiskModelMetadata();
  const scannedCount = withScore.length || 1;
  const model_health = {
    model_version: metadata.version,
    weighted_avg_score: weightedMetrics.weightedAvgScore,
    distribution_by_band: { ...distributionByBand },
    pct_high: Math.round(((distributionByBand["High"] ?? 0) / scannedCount) * 1000) / 10,
    pct_elevated: Math.round(((distributionByBand["Elevated"] ?? 0) / scannedCount) * 1000) / 10,
    governance_locked_at: metadata.created_at,
  };

  return {
    deals,
    counts: {
      total: deals.length,
      scanned: withScore.length,
      unscanned: unscannedCount,
      stale: staleCount,
      needsReview: needsReviewCount,
    },
    distributionByBand,
    exposureByAsset,
    exposureByMarket,
    topDealsByScore,
    recurringRisks,
    riskComposition,
    macroExposure,
    trendSummary: { deteriorations: topDeteriorations, bandTransitions },
    alerts,
    dealBadges,
    dealExplainability,
    weightedMetrics,
    ...(versionDrift && { versionDrift: true }),
    concentration,
    prpi,
    risk_movement,
    ...(backtestResult.sample_size >= 20 && { backtest_summary: backtestResult }),
    ic_performance_summary,
    highImpactDealIds: [...highImpactDealIds],
    model_health,
  };
}
