"use client";

import { useMemo, useState, useCallback, Fragment, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import MethodologyDownloadLink from "@/app/components/MethodologyDownloadLink";

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
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.toString();
    const parsed = fromUrl ? parsePortfolioState(searchParams) : null;
    if (parsed && (parsed.search !== undefined || parsed.statusFilter !== undefined || parsed.riskMovement !== undefined || parsed.highImpact !== undefined || parsed.sortField !== undefined)) {
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
        })
      );
    } catch {
      // ignore
    }
  }, [hydrated, search, statusFilter, assetTypes, markets, tiers, includeUnscanned, sortField, sortDir, riskMovementFilter, highImpactFilter, router]);

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
    const res = await fetch("/api/portfolio-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), config_json }),
    });
    if (res.ok) router.refresh();
    else console.error("Failed to save view", await res.text());
  }, [assetTypes, markets, tiers, statusFilter, sortField, sortDir, includeUnscanned, router]);

  const wm: WeightedMetrics = summary.weightedMetrics;
  const rm = summary.risk_movement ?? { deteriorated: 0, crossed_tiers: 0, version_drift: 0, total_affected: 0, deal_ids: { deteriorated: [], crossed_tiers: [], version_drift: [] } };
  const hasRiskMovement = rm.deteriorated > 0 || rm.crossed_tiers > 0 || rm.version_drift > 0;
  const highImpactSet = useMemo(() => new Set(summary.highImpactDealIds ?? []), [summary.highImpactDealIds]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>Portfolio</h1>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 24 }}>
        Exposure overview for your workspace.
        {" "}
        <Link href="/app/methodology" style={{ color: "#a1a1aa", fontSize: 14 }}>
          Risk Index Methodology
        </Link>
        {scanExportEnabled && (
          <>
            {" · "}
            <MethodologyDownloadLink defaultFilename={methodologyPdfFilename} />
          </>
        )}
      </p>

      {isFree && (
        <div
          style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
          }}
        >
          <p style={{ color: "#e4e4e7", margin: 0 }}>Pro access required.</p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              marginTop: 8,
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      <div style={isFree ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" as const } : {}}>
        {/* Search + filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <input
            type="search"
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.2)",
              color: "#fafafa",
              minWidth: 200,
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.2)",
              color: "#fafafa",
            }}
          >
            <option value="all">All</option>
            <option value="scanned">Scanned</option>
            <option value="unscanned">Unscanned</option>
            <option value="stale">Stale</option>
            <option value="needs_review">Needs Review</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#a1a1aa", fontSize: 14 }}>
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
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.2)",
              color: "#fafafa",
            }}
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
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fafafa",
              }}
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
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(59,130,246,0.2)",
              color: "#93c5fd",
              cursor: "pointer",
              fontSize: 14,
            }}
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
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "#a1a1aa",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Clear all filters
          </button>
          {((summary.highImpactDealIds?.length ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => setHighImpactFilter((v) => !v)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: highImpactFilter ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.2)",
                background: highImpactFilter ? "rgba(239,68,68,0.2)" : "rgba(0,0,0,0.2)",
                color: highImpactFilter ? "#f87171" : "#a1a1aa",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              High impact ({summary.highImpactDealIds?.length ?? 0})
            </button>
          )}
        </div>

        {/* Risk Profile / Weighted metrics */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Risk Profile
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
              <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>Scanned / Total</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                {summary.counts.scanned} / {summary.counts.total}
              </div>
            </div>
            {summary.counts.scanned > 0 && (
              <>
                <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
                  <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>% Elevated+ (count)</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                    {wm.pctElevatedPlusByCount.toFixed(0)}%
                  </div>
                </div>
                {wm.hasWeightData && (
                  <>
                    <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
                      <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>% Elevated+ (by exposure)</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                        {wm.pctElevatedPlusByWeight.toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
                      <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>Weighted avg score</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                        {wm.weightedAvgScore.toFixed(1)}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {summary.prpi != null && (
              <div
                style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}
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
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  Portfolio Risk Pressure
                  <span style={{ cursor: "help", opacity: 0.8 }} aria-label="Component breakdown">ⓘ</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                  {summary.prpi.prpi_band} ({summary.prpi.prpi_score})
                </div>
              </div>
            )}
            {benchmarkEnabled && summary.benchmark != null && (
              <div
                style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 160 }}
                title="Percentile ranks this portfolio's weighted risk score vs. internal cohort. Classification uses PRPI, concentration, and deterioration rules (Conservative, Moderate, Aggressive, Concentrated, Deteriorating)."
              >
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  Benchmark
                  <span style={{ cursor: "help", opacity: 0.8 }} aria-label="Percentile and classification">ⓘ</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fafafa", marginBottom: 2 }}>
                  {summary.benchmark.percentile_rank}th percentile
                </div>
                <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                  {summary.benchmark.classification}
                </div>
              </div>
            )}
            {summary.model_health != null && (
              <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>Model Health</div>
                <div style={{ fontSize: 13, color: "#fafafa", marginBottom: 4 }}>
                  Version: {summary.model_health.model_version}
                </div>
                <div style={{ fontSize: 12, color: "#e4e4e7", marginBottom: 2 }}>
                  Distribution: Low {summary.model_health.distribution_by_band?.Low ?? 0} · Mod {summary.model_health.distribution_by_band?.Moderate ?? 0} · Elev {summary.model_health.distribution_by_band?.Elevated ?? 0} · High {summary.model_health.distribution_by_band?.High ?? 0}
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                  Elevated {Number(summary.model_health.pct_elevated).toFixed(1)}% · High {Number(summary.model_health.pct_high).toFixed(1)}% · Gov locked {summary.model_health.governance_locked_at}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Risk Movement */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "deteriorated" ? null : "deteriorated"))}
              style={{
                padding: 12,
                background: riskMovementFilter === "deteriorated" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                borderRadius: 8,
                minWidth: 140,
                border: riskMovementFilter === "deteriorated" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
                cursor: rm.deteriorated > 0 ? "pointer" : "default",
                textAlign: "left",
              }}
              disabled={rm.deteriorated === 0}
              title={rm.deteriorated > 0 ? "Filter table to deals with comparable delta and score increase ≥8" : undefined}
            >
              <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>Deteriorated</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>{rm.deteriorated}</div>
            </button>
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "crossed_tiers" ? null : "crossed_tiers"))}
              style={{
                padding: 12,
                background: riskMovementFilter === "crossed_tiers" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                borderRadius: 8,
                minWidth: 140,
                border: riskMovementFilter === "crossed_tiers" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
                cursor: rm.crossed_tiers > 0 ? "pointer" : "default",
                textAlign: "left",
              }}
              disabled={rm.crossed_tiers === 0}
              title={rm.crossed_tiers > 0 ? "Filter table to deals with band transitions" : undefined}
            >
              <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>Crossed tiers</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>{rm.crossed_tiers}</div>
            </button>
            <button
              type="button"
              onClick={() => setRiskMovementFilter((v) => (v === "version_drift" ? null : "version_drift"))}
              style={{
                padding: 12,
                background: riskMovementFilter === "version_drift" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                borderRadius: 8,
                minWidth: 140,
                border: riskMovementFilter === "version_drift" ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
                cursor: rm.version_drift > 0 ? "pointer" : "default",
                textAlign: "left",
              }}
              disabled={rm.version_drift === 0}
              title={rm.version_drift > 0 ? "Filter table to deals flagged for version drift" : undefined}
            >
              <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>Version drift</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>{rm.version_drift}</div>
            </button>
          </div>
        </section>

        {/* IC Performance Summary */}
        {summary.ic_performance_summary && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
              IC Performance
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
              <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>% High deals approved</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                  {summary.ic_performance_summary.pctHighDealsApproved}%
                </div>
              </div>
              <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, minWidth: 140 }}>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4 }}>% Elevated deals rejected</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#fafafa" }}>
                  {summary.ic_performance_summary.pctElevatedDealsRejected}%
                </div>
              </div>
            </div>
            {Object.keys(summary.ic_performance_summary.approvalRateByBand).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {Object.entries(summary.ic_performance_summary.approvalRateByBand)
                  .filter(([, v]) => v.decided > 0)
                  .map(([band, v]) => (
                    <div
                      key={band}
                      style={{
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 6,
                        fontSize: 13,
                        color: "#e4e4e7",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{band}</span>
                      {" "}
                      approval: {v.ratePct}%
                      <span style={{ color: "#a1a1aa", marginLeft: 4 }}>
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
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>Alerts</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#e4e4e7", fontSize: 14 }}>
              {summary.alerts.slice(0, 10).map((a, i) => (
                <li key={i}>
                  {a.dealName ? (
                    <Link href={`/app/deals/${a.dealId}`} style={{ color: "#3b82f6", textDecoration: "none" }}>
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
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>To Review</h2>
            <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>
              {summary.counts.needsReview} needs review, {summary.counts.stale} stale.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Deal</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Score</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals
                    .filter((d) => (summary.dealBadges[d.id] ?? []).some((b) => b === "needs_review" || b === "stale"))
                    .slice(0, 10)
                    .map((d) => {
                      const withScore = dealToScore.get(d.id);
                      return (
                        <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                          <td style={{ padding: "8px 12px" }}>
                            <Link href={`/app/deals/${d.id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>
                              {d.name}
                            </Link>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                            {withScore?.risk_index_score ?? "—"}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>
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
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16 }}>
            Unscanned deals: {summary.counts.unscanned}. Run a scan from the deal page.
          </p>
        )}

        {/* Deals table */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>Deals</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Deal</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Badges</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Score</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Complete</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Version</th>
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
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
                        onClick={() => setExpandedDealId(isExpanded ? null : d.id)}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <Link
                            href={`/app/deals/${d.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: "#3b82f6", textDecoration: "none" }}
                          >
                            {d.name}
                          </Link>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
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
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                          {withScore?.risk_index_score ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>
                          {withScore?.risk_index_band ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#a1a1aa", fontSize: 12 }}>
                          {expl?.assumptionCompletenessPct != null ? `${expl.assumptionCompletenessPct}%` : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#71717a", fontSize: 12 }}>
                          {withScore?.risk_index_version ? `v${withScore.risk_index_version}` : "—"}
                        </td>
                      </tr>
                      {isExpanded && expl && (
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                          <td colSpan={6} style={{ padding: "12px 12px", background: "rgba(0,0,0,0.2)", fontSize: 13 }}>
                            <div style={{ marginBottom: 8 }}>
                              <strong style={{ color: "#a1a1aa" }}>Top risk contributors:</strong>{" "}
                              {expl.topRiskContributors.map((r) => `${r.risk_type} (+${r.penalty})`).join(", ") || "—"}
                            </div>
                            {expl.stabilizers.length > 0 && (
                              <div>
                                <strong style={{ color: "#a1a1aa" }}>Stabilizers:</strong> {expl.stabilizers.join(", ")}
                              </div>
                            )}
                            {expl.missingAssumptionKeys && expl.missingAssumptionKeys.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <strong style={{ color: "#a1a1aa" }}>Missing assumptions:</strong> {expl.missingAssumptionKeys.join(", ")}
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
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Distribution by Risk Tier
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {["High", "Elevated", "Moderate", "Low"].map((band) => (
                  <tr key={band} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{band}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                      {distributionByBand[band] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top 5 Highest Risk */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Top 5 Highest Risk Deals
          </h2>
          {summary.topDealsByScore.length === 0 ? (
            <p style={{ color: "#a1a1aa", fontSize: 14 }}>No scanned deals.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Deal</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Score</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topDealsByScore.map((d) => (
                    <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <Link href={`/app/deals/${d.id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>
                          {d.name}
                        </Link>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                        {d.risk_index_score}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{d.risk_index_band ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Exposure by Asset */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Exposure by Asset Type
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Asset type</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Scanned</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.exposureByAsset)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([asset, { total, scanned }]) => (
                    <tr key={asset} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{asset}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>{total}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>{scanned}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Exposure by Market */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Exposure by Market
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Market</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Scanned</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.exposureByMarket)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([key, { label, total, scanned }]) => (
                    <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{label || key}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>{total}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>{scanned}</td>
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
