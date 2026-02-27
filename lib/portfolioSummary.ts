/**
 * Server-side portfolio intelligence: batched queries, latest-scan invariant,
 * weighted metrics, badges, alerts, explainability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTFOLIO_STALE_DAYS } from "./constants";
import { exposureMarketKey, exposureMarketLabel } from "./normalizeMarket";
import { computeRiskPenaltyContribution, describeStabilizers } from "./riskIndex";
import type { DealScanAssumptions } from "./dealScanContract";

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
  created_at: string;
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
    deteriorations: { dealId: string; dealName: string; delta: number; latestScore: number; previousScore: number }[];
    bandTransitions: { dealId: string; dealName: string; fromBand: string; toBand: string }[];
  };
  alerts: AlertItem[];
  dealBadges: Map<string, Badge[]>;
  dealExplainability: Map<string, DealExplainability>;
  weightedMetrics: WeightedMetrics;
  versionDrift?: boolean;
  concentration?: PortfolioConcentration;
};

const ELEVATED_PLUS_BANDS = new Set<string>(["Elevated", "High"]);

const BAND_ORDER: Record<string, number> = { Low: 0, Moderate: 1, Elevated: 2, High: 3 };
function bandWorsened(fromBand: string, toBand: string): boolean {
  const from = BAND_ORDER[fromBand] ?? -1;
  const to = BAND_ORDER[toBand] ?? -1;
  return to > from;
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
      "id, name, asset_type, market, market_key, market_label, latest_scan_id, latest_risk_score, latest_risk_band, latest_scanned_at, scan_count, created_at"
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
    };
  }

  const dealIds = deals.map((d) => d.id);

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
  const alerts: AlertItem[] = [];
  const withScore: DealWithScore[] = [];
  let sumWeight = 0;
  let sumScoreWeight = 0;
  let elevatedPlusCount = 0;
  let elevatedPlusWeight = 0;
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
          deteriorations.push({
            dealId: d.id,
            dealName: d.name,
            delta,
            latestScore: score,
            previousScore: prevScore,
          });
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

    const riskBreakdown = latestScan.risk_index_breakdown as { structural_weight?: number; market_weight?: number; exposure_bucket?: string } | null;
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

  const versions = new Set(withScore.map((d) => d.risk_index_version ?? "").filter(Boolean));
  const versionDrift = versions.size > 1;
  if (versionDrift) {
    alerts.push({ type: "version_drift", message: "Mixed scoring versions in portfolio." });
  }

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

  let needsReviewCount = 0;
  let staleCount = 0;
  dealBadges.forEach((b) => {
    if (b.includes("needs_review")) needsReviewCount += 1;
    if (b.includes("stale")) staleCount += 1;
  });
  const unscannedCount = deals.filter((d) => !dealToLatestScan.has(d.id)).length;

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
    alerts.push({
      type: "score_increase",
      dealId: d.dealId,
      dealName: d.dealName,
      message: `Score +${d.delta} (${d.previousScore} → ${d.latestScore})`,
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
  };
}
