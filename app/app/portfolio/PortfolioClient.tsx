"use client";

import { useMemo, useState, useCallback, Fragment, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import MethodologyDownloadLink from "@/app/components/MethodologyDownloadLink";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

const PORTFOLIO_STATE_KEY = "portfolioFilters";
type RiskMovementFilter = "deteriorated" | "crossed_tiers" | "version_drift" | null;
import type {
  PortfolioSummary,
  DealRow,
  DealWithScore,
  Badge,
  WeightedMetrics,
} from "@/lib/portfolioSummary";

const BADGE_STYLE: Record<Badge, { bg: string; text: string }> = {
  unscanned: { bg: "rgba(113,113,122,0.3)", text: "#a1a1aa" },
  stale: { bg: "rgba(245,158,11,0.2)", text: "#fbbf24" },
  needs_review: { bg: "rgba(239,68,68,0.2)", text: "#f87171" },
};

type SortField = "score" | "last_scanned" | "name" | "market" | "delta";
type SortDirection = "asc" | "desc";

type PortfolioViewConfig = {
  filters?: {
    assetTypes?: string[];
    markets?: string[];
    tiers?: string[];
    status?: "all" | "scanned" | "unscanned" | "stale" | "needs_review";
  };
  sort?: { field: string; direction: "asc" | "desc" };
  includeUnscanned?: boolean;
  visibleColumns?: string[] | null;
};

type SerializedSummary = Omit<PortfolioSummary, "dealBadges" | "dealExplainability"> & {
  dealBadges: Record<string, Badge[]>;
  dealExplainability: Record<
    string,
    {
      topRiskContributors: { risk_type: string; penalty: number }[];
      stabilizers: string[];
      assumptionCompletenessPct?: number | null;
      missingAssumptionKeys?: string[];
    }
  >;
};

type Props = {
  summary: SerializedSummary;
  isFree: boolean;
  scanExportEnabled?: boolean;
  methodologyPdfFilename?: string;
  savedViews?: { id: string; name: string; config_json: PortfolioViewConfig }[];
  benchmarkEnabled?: boolean;
  backtestEnabled?: boolean;
  governanceExportEnabled?: boolean;
  advancedAnalyticsEnabled?: boolean;
};

function parsePortfolioState(params: URLSearchParams): Partial<{
  search: string;
  statusFilter: string;
  assetTypes: string[];
  markets: string[];
  tiers: string[];
  includeUnscanned: boolean;
  sortField: SortField;
  sortDir: SortDirection;
  riskMovement: RiskMovementFilter;
  highImpact: boolean;
  dealIds: string[];
}> {
  const get = (k: string) => params.get(k);
  return {
    search: get("q") ?? undefined,
    statusFilter: get("status") ?? undefined,
    assetTypes: get("assetTypes")?.split(",").filter(Boolean),
    markets: get("markets")?.split(",").filter(Boolean),
    tiers: get("tiers")?.split(",").filter(Boolean),
    includeUnscanned: get("unscanned") !== "0",
    sortField: (get("sort")?.split("-")[0] as SortField | undefined) ?? undefined,
    sortDir: (get("sort")?.split("-")[1] as SortDirection | undefined) ?? undefined,
    riskMovement: (get("risk") as RiskMovementFilter) ?? undefined,
    highImpact: get("highImpact") === "1",
    dealIds: get("dealIds")?.split(",").filter(Boolean),
  };
}

function buildPortfolioParams(state: {
  search: string;
  statusFilter: string;
  assetTypes: Set<string>;
  markets: Set<string>;
  tiers: Set<string>;
  includeUnscanned: boolean;
  sortField: string;
  sortDir: string;
  riskMovement: RiskMovementFilter;
  highImpact: boolean;
  dealIds: string[];
}): URLSearchParams {
  const p = new URLSearchParams();
  if (state.search) p.set("q", state.search);
  if (state.statusFilter && state.statusFilter !== "all") p.set("status", state.statusFilter);
  if (state.assetTypes.size) p.set("assetTypes", [...state.assetTypes].join(","));
  if (state.markets.size) p.set("markets", [...state.markets].join(","));
  if (state.tiers.size) p.set("tiers", [...state.tiers].join(","));
  if (!state.includeUnscanned) p.set("unscanned", "0");
  if (state.sortField !== "score" || state.sortDir !== "desc") p.set("sort", `${state.sortField}-${state.sortDir}`);
  if (state.riskMovement) p.set("risk", state.riskMovement);
  if (state.highImpact) p.set("highImpact", "1");
  if (state.dealIds.length) p.set("dealIds", state.dealIds.join(","));
  return p;
}

export function PortfolioClient({
  summary,
  isFree,
  scanExportEnabled = false,
  methodologyPdfFilename = "cre-signal-risk-index-methodology.pdf",
  savedViews = [],
  benchmarkEnabled = false,
  backtestEnabled = false,
  governanceExportEnabled = false,
  advancedAnalyticsEnabled = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "scanned" | "unscanned" | "stale" | "needs_review">("all");
  const [assetTypes, setAssetTypes] = useState<Set<string>>(new Set());
  const [markets, setMarkets] = useState<Set<string>>(new Set());
  const [tiers, setTiers] = useState<Set<string>>(new Set());
  const [includeUnscanned, setIncludeUnscanned] = useState(true);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [riskMovementFilter, setRiskMovementFilter] = useState<RiskMovementFilter>(null);
  const [highImpactFilter, setHighImpactFilter] = useState(false);
  const [dealIdsFilter, setDealIdsFilter] = useState<string[]>([]);
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.toString();
    const parsed = fromUrl ? parsePortfolioState(searchParams) : null;
    if (parsed && (parsed.search !== undefined || parsed.statusFilter !== undefined || parsed.riskMovement !== undefined || parsed.highImpact !== undefined || parsed.sortField !== undefined || parsed.dealIds !== undefined)) {
      if (parsed.search != null) setSearch(parsed.search);
      if (parsed.statusFilter != null) setStatusFilter(parsed.statusFilter as typeof statusFilter);
      if (parsed.assetTypes) setAssetTypes(new Set(parsed.assetTypes));
      if (parsed.markets) setMarkets(new Set(parsed.markets));
      if (parsed.tiers) setTiers(new Set(parsed.tiers));
      if (parsed.includeUnscanned !== undefined) setIncludeUnscanned(parsed.includeUnscanned);
      if (parsed.sortField) setSortField(parsed.sortField);
      if (parsed.sortDir) setSortDir(parsed.sortDir);
      if (parsed.riskMovement != null) setRiskMovementFilter(parsed.riskMovement);
      if (parsed.highImpact != null) setHighImpactFilter(parsed.highImpact);
      if (parsed.dealIds && parsed.dealIds.length) setDealIdsFilter(parsed.dealIds);
    } else {
      try {
        const raw = sessionStorage.getItem(PORTFOLIO_STATE_KEY);
        if (raw) {
          const s = JSON.parse(raw) as Record<string, unknown>;
          if (s.search != null) setSearch(String(s.search));
          if (s.statusFilter != null) setStatusFilter(s.statusFilter as typeof statusFilter);
          if (Array.isArray(s.assetTypes)) setAssetTypes(new Set(s.assetTypes as string[]));
          if (Array.isArray(s.markets)) setMarkets(new Set(s.markets as string[]));
          if (Array.isArray(s.tiers)) setTiers(new Set(s.tiers as string[]));
          if (typeof s.includeUnscanned === "boolean") setIncludeUnscanned(s.includeUnscanned);
          if (s.sortField) setSortField(s.sortField as SortField);
          if (s.sortDir) setSortDir(s.sortDir as SortDirection);
          if (s.riskMovement) setRiskMovementFilter(s.riskMovement as RiskMovementFilter);
          if (s.highImpact === true) setHighImpactFilter(true);
          if (Array.isArray(s.dealIds) && s.dealIds.length) setDealIdsFilter(s.dealIds as string[]);
        }
      } catch {
        // ignore
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = buildPortfolioParams({
      search,
      statusFilter,
      assetTypes,
      markets,
      tiers,
      includeUnscanned,
      sortField,
      sortDir,
      riskMovement: riskMovementFilter,
      highImpact: highImpactFilter,
      dealIds: dealIdsFilter,
    });
    const qs = params.toString();
    const url = qs ? `/app/portfolio?${qs}` : "/app/portfolio";
    router.replace(url, { scroll: false });
    try {
      sessionStorage.setItem(
        PORTFOLIO_STATE_KEY,
        JSON.stringify({
          search,
          statusFilter,
          assetTypes: [...assetTypes],
          markets: [...markets],
          tiers: [...tiers],
          includeUnscanned,
          sortField,
          sortDir,
          riskMovement: riskMovementFilter,
          highImpact: highImpactFilter,
          dealIds: dealIdsFilter,
        })
      );
    } catch {
      // ignore
    }
  }, [hydrated, search, statusFilter, assetTypes, markets, tiers, includeUnscanned, sortField, sortDir, riskMovementFilter, highImpactFilter, dealIdsFilter, router]);

  const dealToScore = useMemo(() => {
    const m = new Map<string, DealWithScore>();
    for (const d of summary.topDealsByScore) m.set(d.id, d);
    for (const d of summary.deals) {
      if (m.has(d.id)) continue;
      if (d.latest_risk_score != null) {
        m.set(d.id, {
          ...d,
          risk_index_score: d.latest_risk_score,
          risk_index_band: d.latest_risk_band,
          risk_index_version: null,
        });
      }
    }
    return m;
  }, [summary.topDealsByScore, summary.deals]);

  const deteriorationsByDealId = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of summary.trendSummary.deteriorations) m.set(t.dealId, t.delta);
    return m;
  }, [summary.trendSummary.deteriorations]);

  const filteredDeals = useMemo(() => {
    let list = summary.deals;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      const badges = summary.dealBadges;
      list = list.filter((d) => {
        const b = badges[d.id] ?? [];
        if (statusFilter === "scanned") return !b.includes("unscanned");
        if (statusFilter === "unscanned") return b.includes("unscanned");
        if (statusFilter === "stale") return b.includes("stale");
        if (statusFilter === "needs_review") return b.includes("needs_review");
        return true;
      });
    }
    if (!includeUnscanned) {
      list = list.filter((d) => (summary.dealBadges[d.id] ?? []).indexOf("unscanned") === -1);
    }
    if (assetTypes.size > 0) {
      list = list.filter((d) => d.asset_type && assetTypes.has(d.asset_type));
    }
    if (markets.size > 0) {
      const mk = (d: DealRow) => d.market_key || (d.market ?? "").toLowerCase();
      list = list.filter((d) => markets.has(mk(d)));
    }
    if (tiers.size > 0) {
      list = list.filter((d) => {
        const withScore = dealToScore.get(d.id);
        const band = withScore?.risk_index_band ?? "—";
        return tiers.has(band);
      });
    }
    if (riskMovementFilter) {
      const ids = summary.risk_movement?.deal_ids?.[riskMovementFilter];
      if (ids?.length) list = list.filter((d) => ids.includes(d.id));
    }
    if (highImpactFilter && (summary.highImpactDealIds?.length ?? 0) > 0) {
      const set = new Set(summary.highImpactDealIds);
      list = list.filter((d) => set.has(d.id));
    }
    if (dealIdsFilter.length > 0) {
      const dealIdSet = new Set(dealIdsFilter);
      list = list.filter((d) => dealIdSet.has(d.id));
    }
    list = [...list].sort((a, b) => {
      const aScore = dealToScore.get(a.id)?.risk_index_score ?? -1;
      const bScore = dealToScore.get(b.id)?.risk_index_score ?? -1;
      const aScanned = a.latest_scanned_at ?? "";
      const bScanned = b.latest_scanned_at ?? "";
      const aDelta = deteriorationsByDealId.get(a.id) ?? 0;
      const bDelta = deteriorationsByDealId.get(b.id) ?? 0;
      let cmp = 0;
      switch (sortField) {
        case "score":
          cmp = (aScore - bScore) * (sortDir === "desc" ? -1 : 1);
          break;
        case "last_scanned":
          cmp = (aScanned > bScanned ? 1 : aScanned < bScanned ? -1 : 0) * (sortDir === "desc" ? -1 : 1);
          break;
        case "name":
          cmp = (a.name.localeCompare(b.name)) * (sortDir === "asc" ? 1 : -1);
          break;
        case "market":
          cmp = ((a.market_label ?? a.market ?? "").localeCompare(b.market_label ?? b.market ?? "")) * (sortDir === "asc" ? 1 : -1);
          break;
        case "delta":
          cmp = (aDelta - bDelta) * (sortDir === "desc" ? -1 : 1);
          break;
        default:
          cmp = (bScore - aScore);
      }
      return cmp;
    });
    return list;
  }, [
    summary.deals,
    summary.dealBadges,
    summary.risk_movement?.deal_ids,
    summary.highImpactDealIds,
    search,
    statusFilter,
    includeUnscanned,
    assetTypes,
    markets,
    tiers,
    riskMovementFilter,
    highImpactFilter,
    dealIdsFilter,
    sortField,
    sortDir,
    dealToScore,
    deteriorationsByDealId,
  ]);

  const distributionByBand = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of filteredDeals) {
      const withScore = dealToScore.get(d.id);
      const band = withScore?.risk_index_band ?? "—";
      out[band] = (out[band] ?? 0) + 1;
    }
    return out;
  }, [filteredDeals, dealToScore]);

  const uniqueAssetTypes = useMemo(() => {
    const set = new Set<string>();
    summary.deals.forEach((d) => set.add(d.asset_type ?? "Unspecified"));
    return [...set].sort();
  }, [summary.deals]);

  const uniqueMarkets = useMemo(() => {
    const keys = new Set<string>();
    summary.deals.forEach((d) => keys.add(d.market_key ?? d.market ?? "—"));
    return [...keys].sort();
  }, [summary.deals]);

  const loadView = useCallback((config: PortfolioViewConfig) => {
    if (config.filters?.assetTypes?.length) setAssetTypes(new Set(config.filters.assetTypes));
    else setAssetTypes(new Set());
    if (config.filters?.markets?.length) setMarkets(new Set(config.filters.markets));
    else setMarkets(new Set());
    if (config.filters?.tiers?.length) setTiers(new Set(config.filters.tiers));
    else setTiers(new Set());
    if (config.filters?.status) setStatusFilter(config.filters.status as typeof statusFilter);
    if (config.includeUnscanned !== undefined) setIncludeUnscanned(config.includeUnscanned);
    if (config.sort?.field) setSortField(config.sort.field as SortField);
    if (config.sort?.direction) setSortDir(config.sort.direction);
  }, []);

  const saveView = useCallback(async () => {
    const name = window.prompt("View name");
    if (!name?.trim()) return;
    const config_json: PortfolioViewConfig = {
      filters: {
        assetTypes: assetTypes.size ? [...assetTypes] : undefined,
        markets: markets.size ? [...markets] : undefined,
        tiers: tiers.size ? [...tiers] : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      },
      sort: { field: sortField, direction: sortDir },
      includeUnscanned,
    };
    const res = await fetchJsonWithTimeout("/api/portfolio-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), config_json }),
    }, 15000);
    if (res.ok) router.refresh();
    else console.error("Failed to save view", res.text);
  }, [assetTypes, markets, tiers, statusFilter, sortField, sortDir, includeUnscanned, router]);

  const wm: WeightedMetrics = summary.weightedMetrics;
  const rm = summary.risk_movement ?? { deteriorated: 0, crossed_tiers: 0, version_drift: 0, total_affected: 0, deal_ids: { deteriorated: [], crossed_tiers: [], version_drift: [] } };
  const hasRiskMovement = rm.deteriorated > 0 || rm.crossed_tiers > 0 || rm.version_drift > 0;
  const highImpactSet = useMemo(() => new Set(summary.highImpactDealIds ?? []), [summary.highImpactDealIds]);

  return (
    <div className="max-w-[960px] mx-auto p-6">
      <div className="mb-6">
        <Link href="/app" className="text-muted-foreground text-sm no-underline">
          ← Dashboard
        </Link>
      </div>

      <h1 className="text-[28px] font-bold text-foreground mb-2">Portfolio</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Portfolio Risk Governance Overview
        <br />
        <span className="text-[13px]">Snapshot-based percentile positioning and active policy enforcement.</span>
        {" "}
        <Link href="/app/methodology" className="text-muted-foreground text-sm">
          Risk Index Methodology
        </Link>
        {" · "}
        <Link href="/app/policy" className="text-muted-foreground text-sm">
          Governance
        </Link>
        {scanExportEnabled && (
          <>
            {" · "}
            <MethodologyDownloadLink defaultFilename={methodologyPdfFilename} />
          </>
        )}
      </p>

      {isFree && (
        <div className="p-4 mb-6 bg-muted/50 border border-border rounded-lg">
          <p className="text-foreground m-0">Starter plan required.</p>
          <Link
            href="/pricing"
            className="inline-block mt-2 px-4 py-2 bg-[#3b82f6] text-white rounded-md text-sm font-semibold no-underline"
          >
            Upgrade to Starter
          </Link>
        </div>
      )}

      <div style={isFree ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" as const } : {}}>
        {/* Search + filters */}
        <div className="flex flex-wrap gap-3 mb-5 items-center">
          <input
            type="search"
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-background text-foreground min-w-[200px]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 rounded-md border border-border bg-background text-foreground"
          >
            <option value="all">All</option>
            <option value="scanned">Scanned</option>
            <option value="unscanned">Unscanned</option>
            <option value="stale">Stale</option>
            <option value="needs_review">Needs Review</option>
          </select>
          <label className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <input
              type="checkbox"
              checked={includeUnscanned}
              onChange={(e) => setIncludeUnscanned(e.target.checked)}
            />
            Include unscanned
          </label>
          <select
            value={`${sortField}-${sortDir}`}
            onChange={(e) => {
              const [f, d] = (e.target.value as string).split("-");
              setSortField(f as SortField);
              setSortDir(d as SortDirection);
            }}
            className="px-3 py-2 rounded-md border border-border bg-background text-foreground"
          >
            <option value="score-desc">Score (high first)</option>
            <option value="score-asc">Score (low first)</option>
            <option value="last_scanned-desc">Last scanned (newest)</option>
            <option value="last_scanned-asc">Last scanned (oldest)</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="market-asc">Market A–Z</option>
            <option value="delta-desc">Largest increase</option>
          </select>
          {savedViews.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                const v = savedViews.find((x) => x.id === id);
                if (v?.config_json) loadView(v.config_json as PortfolioViewConfig);
              }}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground"
            >
              <option value="">Load view...</option>
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={saveView}
            style={{
              background: "rgba(59,130,246,0.2)",
              color: "#93c5fd",
            }}
            className="px-4 py-2 rounded-md border border-border cursor-pointer text-sm"
          >
            Save View
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setAssetTypes(new Set());
              setMarkets(new Set());
              setTiers(new Set());
              setIncludeUnscanned(true);
              setSortField("score");
              setSortDir("desc");
              setRiskMovementFilter(null);
              setHighImpactFilter(false);
            }}
            className="px-3 py-2 rounded-md border border-border bg-muted/50 text-muted-foreground cursor-pointer text-[13px]"
          >
            Clear all filters
          </button>
          {((summary.highImpactDealIds?.length ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => setHighImpactFilter((v) => !v)}
              style={{
                border: highImpactFilter ? "1px solid rgba(239,68,68,0.5)" : undefined,
                background: highImpactFilter ? "rgba(239,68,68,0.2)" : undefined,
                color: highImpactFilter ? "#f87171" : undefined,
              }}
              className={`px-3 py-1.5 rounded-md cursor-pointer text-xs font-semibold ${
                highImpactFilter ? "" : "border border-border bg-background text-muted-foreground"
              }`}
            >
              High impact ({summary.highImpactDealIds?.length ?? 0})
            </button>
          )}
        </div>

        {/* Risk Profile / Weighted metrics */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Risk Profile
          </h2>
          <div className="flex flex-wrap gap-4">
            <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
              <div className="text-xs text-muted-foreground mb-1">Scanned / Total</div>
              <div className="text-xl font-semibold text-foreground">
                {summary.counts.scanned} / {summary.counts.total}
              </div>
            </div>
            {summary.counts.scanned > 0 && (
              <>
                <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
                  <div className="text-xs text-muted-foreground mb-1">% Elevated+ (count)</div>
                  <div className="text-xl font-semibold text-foreground">
                    {wm.pctElevatedPlusByCount.toFixed(0)}%
                  </div>
                </div>
                {wm.hasWeightData && (
                  <>
                    <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
                      <div className="text-xs text-muted-foreground mb-1">% Elevated+ (by exposure)</div>
                      <div className="text-xl font-semibold text-foreground">
                        {wm.pctElevatedPlusByWeight.toFixed(0)}%
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
                      <div className="text-xs text-muted-foreground mb-1">Weighted avg score</div>
                      <div className="text-xl font-semibold text-foreground">
                        {wm.weightedAvgScore.toFixed(1)}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {summary.prpi != null && (
              <div
                className="p-3 bg-muted/50 rounded-lg min-w-[140px]"
                title={
                  [
                    "PRPI = weighted sum of components (0–100). Formula weights:",
                    `• Weighted avg score (30%): ${summary.prpi.components.weighted_average_score.toFixed(1)}`,
                    `• % exposure High (25%): ${summary.prpi.components.pct_exposure_high.toFixed(1)}%`,
                    `• % exposure deteriorating (15%): ${summary.prpi.components.pct_exposure_deteriorating.toFixed(1)}%`,
                    `• Top market concentration (15%): ${summary.prpi.components.top_market_concentration_pct.toFixed(0)}%`,
                    `• Top asset concentration (15%): ${summary.prpi.components.top_asset_concentration_pct.toFixed(0)}%`,
                  ].join("\n")
                }
              >
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Portfolio Risk Pressure
                  <span className="cursor-help opacity-80" aria-label="Component breakdown">ⓘ</span>
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {summary.prpi.prpi_band} ({summary.prpi.prpi_score})
                </div>
              </div>
            )}
            {benchmarkEnabled && summary.benchmark != null && (
              <div
                className="p-3 bg-muted/50 rounded-lg min-w-[160px]"
                title="Percentile ranks this portfolio's weighted risk score vs. internal cohort. Classification uses PRPI, concentration, and deterioration rules (Conservative, Moderate, Aggressive, Concentrated, Deteriorating)."
              >
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Benchmark
                  <span className="cursor-help opacity-80" aria-label="Percentile and classification">ⓘ</span>
                </div>
                <div className="text-sm font-semibold text-foreground mb-0.5">
                  {summary.benchmark.percentile_rank}th percentile
                </div>
                <div className="text-xs text-muted-foreground">
                  {summary.benchmark.classification}
                </div>
                {summary.benchmark_context && (
                  <div className="text-[11px] text-muted-foreground/70 mt-1.5 border-t border-border pt-1.5">
                    {summary.benchmark_context.method_version && (
                      <div>Method: {summary.benchmark_context.method_version}</div>
                    )}
                    {summary.benchmark_context.snapshot_id && (
                      <div title={summary.benchmark_context.snapshot_id}>
                        Snapshot: {summary.benchmark_context.snapshot_id.slice(0, 8)}…
                      </div>
                    )}
                    {summary.benchmark_context.cohort_key && (
                      <div>Cohort: {summary.benchmark_context.cohort_key}</div>
                    )}
                    {summary.benchmark_context.delta_comparable != null && (
                      <div>{summary.benchmark_context.delta_comparable ? "Delta comparable" : "Delta not comparable"}</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {summary.model_health != null && (
              <div className="p-3 bg-muted/50 rounded-lg min-w-[160px]">
                <div className="text-xs text-muted-foreground mb-1.5">Model Health</div>
                <div className="text-[13px] text-foreground mb-1">
                  Version: {summary.model_health.model_version}
                </div>
                <div className="text-xs text-foreground mb-0.5">
                  Distribution: Low {summary.model_health.distribution_by_band?.Low ?? 0} · Mod {summary.model_health.distribution_by_band?.Moderate ?? 0} · Elev {summary.model_health.distribution_by_band?.Elevated ?? 0} · High {summary.model_health.distribution_by_band?.High ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Elevated {Number(summary.model_health.pct_elevated).toFixed(1)}% · High {Number(summary.model_health.pct_high).toFixed(1)}% · Gov locked {summary.model_health.governance_locked_at}
                </div>
              </div>
            )}
            {advancedAnalyticsEnabled && (summary.model_health ?? summary.distributionByBand) && (
              <div className="p-3 bg-muted/50 rounded-lg min-w-[160px]">
                <div className="text-xs text-muted-foreground mb-1.5">Advanced analytics</div>
                <div className="text-xs text-foreground mb-1">
                  {summary.model_health ? (
                    <>
                      P90+ (High) concentration: {Number(summary.model_health.pct_high).toFixed(1)}%
                    </>
                  ) : (
                    <>
                      High: {summary.counts.scanned ? Math.round(((summary.distributionByBand?.High ?? 0) / summary.counts.scanned) * 1000) / 10 : 0}%
                    </>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Band distribution: {["Low", "Moderate", "Elevated", "High"].map((b) => `${b} ${summary.distributionByBand?.[b] ?? 0}`).join(" · ")}
                </div>
              </div>
            )}
            {summary.policy_status != null && (
              <div className="p-3 bg-muted/50 rounded-lg min-w-[180px] max-w-[280px]">
                <div className="text-xs text-muted-foreground mb-1.5">Governance</div>
                <div className="text-[13px] text-foreground mb-1">
                  {summary.policy_status.active_policy?.name ?? "Governance"}
                </div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background:
                        summary.policy_status.overall_status === "PASS"
                          ? "rgba(34,197,94,0.2)"
                          : summary.policy_status.overall_status === "BLOCK"
                            ? "rgba(239,68,68,0.25)"
                            : "rgba(245,158,11,0.2)",
                      color:
                        summary.policy_status.overall_status === "PASS"
                          ? "#22c55e"
                          : summary.policy_status.overall_status === "BLOCK"
                            ? "#f87171"
                            : "#fbbf24",
                    }}
                  >
                    {summary.policy_status.overall_status}
                  </span>
                  {summary.policy_status.violation_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {summary.policy_status.violation_count} violation{summary.policy_status.violation_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {summary.policy_status.top_violations?.length > 0 && (
                  <ul className="m-0 mb-2 pl-4 text-[11px] text-foreground leading-snug">
                    {summary.policy_status.top_violations.slice(0, 3).map((v, i) => (
                      <li key={i}>{v.message}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/app/policy"
                    style={{ color: "#a78bfa" }}
                    className="text-xs no-underline"
                  >
                    Manage Governance
                  </Link>
                  {governanceExportEnabled && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { ok, json } = await fetchJsonWithTimeout("/api/portfolio/governance-export", { method: "GET" }, 15000);
                          if (!ok || json == null) return;
                          const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `governance-export-${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                          URL.revokeObjectURL(a.href);
                        } catch (e) {
                          console.error("Governance export failed:", e);
                        }
                      }}
                      style={{ color: "#a78bfa" }}
                      className="text-xs bg-transparent border-none cursor-pointer p-0 underline"
                    >
                      Export governance packet
                    </button>
                  )}
                  {summary.policy_status.evaluation?.violations?.some((v) => v.affected_deal_ids?.length) && (() => {
                    const allIds = summary.policy_status!.evaluation!.violations.flatMap((v) => v.affected_deal_ids ?? []);
                    const uniqueIds = [...new Set(allIds)];
                    if (uniqueIds.length === 0) return null;
                    return (
                      <Link
                        href={`/app/portfolio?dealIds=${uniqueIds.join(",")}`}
                        style={{ color: "#a78bfa" }}
                        className="text-xs no-underline"
                      >
                        View affected deals
                      </Link>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Risk Movement */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            Risk Movement
            {hasRiskMovement && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(245,158,11,0.2)",
                  color: "#fbbf24",
                }}
              >
                Attention
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "deteriorated" ? null : "deteriorated"))}
              style={{
                background: riskMovementFilter === "deteriorated" ? "rgba(245,158,11,0.15)" : undefined,
                border: riskMovementFilter === "deteriorated" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
              }}
              className={`p-3 rounded-lg min-w-[140px] text-left ${
                riskMovementFilter !== "deteriorated" ? "bg-muted/50" : ""
              } ${rm.deteriorated > 0 ? "cursor-pointer" : "cursor-default"}`}
              disabled={rm.deteriorated === 0}
              title={rm.deteriorated > 0 ? "Filter table to deals with comparable delta and score increase ≥8" : undefined}
            >
              <div className="text-xs text-muted-foreground mb-1">Deteriorated</div>
              <div className="text-xl font-semibold text-foreground">{rm.deteriorated}</div>
            </button>
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "crossed_tiers" ? null : "crossed_tiers"))}
              style={{
                background: riskMovementFilter === "crossed_tiers" ? "rgba(245,158,11,0.15)" : undefined,
                border: riskMovementFilter === "crossed_tiers" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
              }}
              className={`p-3 rounded-lg min-w-[140px] text-left ${
                riskMovementFilter !== "crossed_tiers" ? "bg-muted/50" : ""
              } ${rm.crossed_tiers > 0 ? "cursor-pointer" : "cursor-default"}`}
              disabled={rm.crossed_tiers === 0}
              title={rm.crossed_tiers > 0 ? "Filter table to deals with band transitions" : undefined}
            >
              <div className="text-xs text-muted-foreground mb-1">Crossed tiers</div>
              <div className="text-xl font-semibold text-foreground">{rm.crossed_tiers}</div>
            </button>
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "version_drift" ? null : "version_drift"))}
              style={{
                background: riskMovementFilter === "version_drift" ? "rgba(245,158,11,0.15)" : undefined,
                border: riskMovementFilter === "version_drift" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
              }}
              className={`p-3 rounded-lg min-w-[140px] text-left ${
                riskMovementFilter !== "version_drift" ? "bg-muted/50" : ""
              } ${rm.version_drift > 0 ? "cursor-pointer" : "cursor-default"}`}
              disabled={rm.version_drift === 0}
              title={rm.version_drift > 0 ? "Filter table to deals flagged for version drift" : undefined}
            >
              <div className="text-xs text-muted-foreground mb-1">Version drift</div>
              <div className="text-xl font-semibold text-foreground">{rm.version_drift}</div>
            </button>
          </div>
        </section>

        {/* IC Performance Summary */}
        {summary.ic_performance_summary && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-3">
              IC Performance
            </h2>
            <div className="flex flex-wrap gap-4 mb-3">
              <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
                <div className="text-xs text-muted-foreground mb-1">% High deals approved</div>
                <div className="text-xl font-semibold text-foreground">
                  {summary.ic_performance_summary.pctHighDealsApproved}%
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg min-w-[140px]">
                <div className="text-xs text-muted-foreground mb-1">% Elevated deals rejected</div>
                <div className="text-xl font-semibold text-foreground">
                  {summary.ic_performance_summary.pctElevatedDealsRejected}%
                </div>
              </div>
            </div>
            {Object.keys(summary.ic_performance_summary.approvalRateByBand).length > 0 && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(summary.ic_performance_summary.approvalRateByBand)
                  .filter(([, v]) => v.decided > 0)
                  .map(([band, v]) => (
                    <div
                      key={band}
                      className="px-3 py-2 bg-muted/50 rounded-md text-[13px] text-foreground"
                    >
                      <span className="font-semibold">{band}</span>
                      {" "}
                      approval: {v.ratePct}%
                      <span className="text-muted-foreground ml-1">
                        ({v.approved}/{v.decided})
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* Alerts */}
        {summary.alerts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-3">Alerts</h2>
            <ul className="m-0 pl-5 text-foreground text-sm">
              {summary.alerts.slice(0, 10).map((a, i) => (
                <li key={i}>
                  {a.dealName ? (
                    <Link href={`/app/deals/${a.dealId}`} className="text-[#3b82f6] no-underline">
                      {a.dealName}
                    </Link>
                  ) : null}
                  {a.dealName ? ": " : ""}
                  {a.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* To Review */}
        {(summary.counts.needsReview > 0 || summary.counts.stale > 0) && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-3">To Review</h2>
            <p className="text-muted-foreground text-sm mb-2">
              {summary.counts.needsReview} needs review, {summary.counts.stale} stale.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-muted-foreground">Deal</th>
                    <th className="text-right px-3 py-2 text-muted-foreground">Score</th>
                    <th className="text-left px-3 py-2 text-muted-foreground">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals
                    .filter((d) => (summary.dealBadges[d.id] ?? []).some((b) => b === "needs_review" || b === "stale"))
                    .slice(0, 10)
                    .map((d) => {
                      const withScore = dealToScore.get(d.id);
                      return (
                        <tr key={d.id} className="border-b border-border">
                          <td className="px-3 py-2">
                            <Link href={`/app/deals/${d.id}`} className="text-[#3b82f6] no-underline">
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {withScore?.risk_index_score ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {withScore?.risk_index_band ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {summary.counts.unscanned > 0 && (
          <p className="text-muted-foreground text-sm mb-4">
            Unscanned deals: {summary.counts.unscanned}. Run a scan from the deal page.
          </p>
        )}

        {/* Deals table */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Deals</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground">Deal</th>
                  <th className="text-left px-3 py-2 text-muted-foreground">Badges</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Score</th>
                  <th className="text-left px-3 py-2 text-muted-foreground">Tier</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Complete</th>
                  <th className="text-left px-3 py-2 text-muted-foreground">Version</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => {
                  const withScore = dealToScore.get(d.id);
                  const badges = summary.dealBadges[d.id] ?? [];
                  const expl = summary.dealExplainability[d.id];
                  const isExpanded = expandedDealId === d.id;
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className="border-b border-border cursor-pointer"
                        onClick={() => setExpandedDealId(isExpanded ? null : d.id)}
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/app/deals/${d.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#3b82f6] no-underline"
                          >
                            {d.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-1 items-center">
                            {highImpactSet.has(d.id) && (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(239,68,68,0.25)",
                                  color: "#f87171",
                                }}
                              >
                                High impact
                              </span>
                            )}
                            {badges.length > 0 ? (
                              badges.map((b) => (
                                <span
                                  key={b}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    background: BADGE_STYLE[b].bg,
                                    color: BADGE_STYLE[b].text,
                                  }}
                                >
                                  {b.replace("_", " ")}
                                </span>
                              ))
                            ) : !highImpactSet.has(d.id) ? "—" : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">
                          {withScore?.risk_index_score ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {withScore?.risk_index_band ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                          {expl?.assumptionCompletenessPct != null ? `${expl.assumptionCompletenessPct}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground/70 text-xs">
                          {withScore?.risk_index_version ? `v${withScore.risk_index_version}` : "—"}
                        </td>
                      </tr>
                      {isExpanded && expl && (
                        <tr className="border-b border-border">
                          <td colSpan={6} className="px-3 py-3 bg-background text-[13px]">
                            <div className="mb-2">
                              <strong className="text-muted-foreground">Top risk contributors:</strong>{" "}
                              {expl.topRiskContributors.map((r) => `${r.risk_type} (+${r.penalty})`).join(", ") || "—"}
                            </div>
                            {expl.stabilizers.length > 0 && (
                              <div>
                                <strong className="text-muted-foreground">Stabilizers:</strong> {expl.stabilizers.join(", ")}
                              </div>
                            )}
                            {expl.missingAssumptionKeys && expl.missingAssumptionKeys.length > 0 && (
                              <div className="mt-1.5">
                                <strong className="text-muted-foreground">Missing assumptions:</strong> {expl.missingAssumptionKeys.join(", ")}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Distribution by Risk Tier */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Distribution by Risk Tier
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground">Tier</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Count</th>
                </tr>
              </thead>
              <tbody>
                {["High", "Elevated", "Moderate", "Low"].map((band) => (
                  <tr key={band} className="border-b border-border">
                    <td className="px-3 py-2 text-foreground">{band}</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {distributionByBand[band] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top 5 Highest Risk */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Top 5 Highest Risk Deals
          </h2>
          {summary.topDealsByScore.length === 0 ? (
            <p className="text-muted-foreground text-sm">No scanned deals.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-muted-foreground">Deal</th>
                    <th className="text-right px-3 py-2 text-muted-foreground">Score</th>
                    <th className="text-left px-3 py-2 text-muted-foreground">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topDealsByScore.map((d) => (
                    <tr key={d.id} className="border-b border-border">
                      <td className="px-3 py-2">
                        <Link href={`/app/deals/${d.id}`} className="text-[#3b82f6] no-underline">
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {d.risk_index_score}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{d.risk_index_band ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Exposure by Asset */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Exposure by Asset Type
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground">Asset type</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Total</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.exposureByAsset)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([asset, { total, scanned }]) => (
                    <tr key={asset} className="border-b border-border">
                      <td className="px-3 py-2 text-foreground">{asset}</td>
                      <td className="px-3 py-2 text-right text-foreground">{total}</td>
                      <td className="px-3 py-2 text-right text-foreground">{scanned}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Exposure by Market */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Exposure by Market
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground">Market</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Total</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.exposureByMarket)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([key, { label, total, scanned }]) => (
                    <tr key={key} className="border-b border-border">
                      <td className="px-3 py-2 text-foreground">{label || key}</td>
                      <td className="px-3 py-2 text-right text-foreground">{total}</td>
                      <td className="px-3 py-2 text-right text-foreground">{scanned}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
