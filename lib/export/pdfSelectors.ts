/**
 * Deterministic selectors for one-page IC PDF: top assumptions, top risks, deduped macro signals.
 * Dedupe by content key (category::normalizedText); caps: maxSignalsPerRisk=2, maxSignalsOverall=5.
 */

import type { DealScanAssumptions } from "@/lib/dealScanContract";

export const MAX_SIGNALS_PER_RISK = 2;
export const MAX_SIGNALS_OVERALL = 5;

const CONFIDENCE_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const SEVERITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** Whitelist order for assumption keys (IC-ready: purchase_price first, then key assumptions). */
const ASSUMPTION_KEY_ORDER = [
  "purchase_price",
  "noi_year1",
  "cap_rate_in",
  "exit_cap",
  "vacancy",
  "ltv",
  "debt_rate",
  "rent_growth",
  "hold_period_years",
  "expense_growth",
] as const;

export type AssumptionRow = {
  key: string;
  value: number | null;
  unit: string | null;
  confidence: string;
};

/**
 * Select top N assumptions by confidence (desc) then key whitelist order.
 */
export function selectTopAssumptions(
  assumptions: DealScanAssumptions | undefined | null,
  limit: number = 6
): AssumptionRow[] {
  if (!assumptions || typeof assumptions !== "object") return [];

  const entries = Object.entries(assumptions)
    .filter(([, cell]) => cell != null && typeof cell === "object")
    .map(([key, cell]) => {
      const c = cell as { value?: number | null; unit?: string | null; confidence?: string };
      return {
        key,
        value: c.value != null && typeof c.value === "number" ? c.value : null,
        unit: typeof c.unit === "string" ? c.unit : null,
        confidence: typeof c.confidence === "string" ? c.confidence : "Low",
      };
    })
    .sort((a, b) => {
      const confA = CONFIDENCE_ORDER[a.confidence] ?? 0;
      const confB = CONFIDENCE_ORDER[b.confidence] ?? 0;
      if (confB !== confA) return confB - confA;
      const idxA = ASSUMPTION_KEY_ORDER.indexOf(a.key as (typeof ASSUMPTION_KEY_ORDER)[number]);
      const idxB = ASSUMPTION_KEY_ORDER.indexOf(b.key as (typeof ASSUMPTION_KEY_ORDER)[number]);
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;
      return orderA - orderB;
    });

  return entries.slice(0, limit);
}

export type RiskRow = {
  risk_type: string;
  severity_current: string;
  confidence: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
};

/**
 * Select top N risks by severity (desc) then confidence (desc).
 */
export function selectTopRisks(
  risks: RiskRow[],
  limit: number = 3
): RiskRow[] {
  const sorted = [...risks].sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity_current] ?? 0;
    const sevB = SEVERITY_ORDER[b.severity_current] ?? 0;
    if (sevB !== sevA) return sevB - sevA;
    const confA = CONFIDENCE_ORDER[a.confidence ?? ""] ?? 0;
    const confB = CONFIDENCE_ORDER[b.confidence ?? ""] ?? 0;
    return confB - confA;
  });
  return sorted.slice(0, limit);
}

export type MacroSignalRow = {
  signal_id: string;
  display_text: string;
};

/** Normalize text for dedupe: trim, collapse whitespace, remove trailing punctuation differences. */
export function normalizeTextForDedupe(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.replace(/[.,;:!?]+$/, "").toLowerCase();
}

/** Stable key for content-based dedupe: category::normalizedText (body = what_changed or link_reason). */
export function signalStableKey(
  category: string | null | undefined,
  bodyText: string | null | undefined
): string {
  const cat = (category ?? "").trim().toLowerCase() || "general";
  const norm = normalizeTextForDedupe(bodyText ?? "");
  return `${cat}::${norm}`;
}

/**
 * Build display text for one signal (Category — text), max ~120 chars.
 */
function buildDisplayText(
  signal_type: string | null | undefined,
  what_changed: string | null | undefined,
  link_reason: string | null | undefined
): string {
  const body = what_changed ?? link_reason ?? "";
  const text = [signal_type, body].filter(Boolean).join(" — ") || "Signal";
  return text.slice(0, 120);
}

/**
 * Dedupe macro signals by stable key (category::normalizedText). First occurrence wins.
 * Respects max; use MAX_SIGNALS_OVERALL (5) for final section.
 */
export function dedupeSignals(
  links: {
    signal_id: string;
    link_reason: string | null;
    signal_type?: string | null;
    what_changed?: string | null;
  }[],
  max: number = MAX_SIGNALS_OVERALL
): MacroSignalRow[] {
  const category = (link: { signal_type?: string | null; what_changed?: string | null; link_reason?: string | null }) =>
    (link.signal_type ?? "").trim() || "General";
  const body = (link: { what_changed?: string | null; link_reason?: string | null }) =>
    link.what_changed ?? link.link_reason ?? "";
  const byKey = new Map<string, { signal_id: string; display_text: string }>();
  for (const link of links) {
    const key = signalStableKey(link.signal_type, body(link));
    if (byKey.has(key)) continue;
    byKey.set(key, {
      signal_id: link.signal_id,
      display_text: buildDisplayText(link.signal_type, link.what_changed, link.link_reason),
    });
    if (byKey.size >= max) break;
  }
  return Array.from(byKey.values());
}

/**
 * Per-risk linked signal with risk_id for filtering and capping.
 */
export type LinkWithRisk = {
  deal_risk_id: string;
  risk_type: string;
  signal_id: string;
  link_reason: string | null;
  signal_type: string | null;
  what_changed: string | null;
};

/** Preferred signal_type keywords per risk type (for relevance filtering). */
const RISK_PREFERRED_SIGNAL_KEYWORDS: Record<string, string[]> = {
  VacancyUnderstated: ["vacancy", "absorption", "supply", "demand", "pipeline", "inventory"],
  RentGrowthAggressive: ["rent", "effective rent", "affordability", "demand", "growth"],
  ExitCapCompression: ["cap rate", "rates", "credit", "spread", "transaction", "pricing"],
  ExpenseUnderstated: ["expense", "insurance", "tax", "operating"],
  InsuranceRisk: ["insurance", "policy", "expense"],
  RefiRisk: ["credit", "lender", "financing", "rates"],
  DebtCostRisk: ["credit", "lender", "financing", "rates"],
  MarketLiquidityRisk: ["liquidity", "credit", "transaction"],
  RegulatoryPolicyExposure: ["policy", "regulatory"],
  ConstructionTimingRisk: ["supply", "construction", "pipeline"],
  DataMissing: [],
};

/**
 * Score signal relevance for a risk: 2 = preferred category match, 1 = generic, 0 = skip.
 */
function signalRelevanceForRisk(signalType: string, riskType: string): number {
  const t = (signalType ?? "").toLowerCase();
  const keywords = RISK_PREFERRED_SIGNAL_KEYWORDS[riskType];
  if (!keywords?.length) return 1;
  if (keywords.some((k) => t.includes(k.toLowerCase()))) return 2;
  return 1;
}

/**
 * Filter links by deal context: asset_type and market. Signals table has signal_type/what_changed
 * (no asset_type column); we infer from signal_type text (e.g. "multifamily supply" → only for multifamily deals).
 */
function signalAppliesToDeal(
  signalType: string,
  assetType: string | null | undefined,
  _market: string | null | undefined
): boolean {
  const t = (signalType ?? "").toLowerCase();
  const isMultifamilySignal =
    (t.includes("multifamily") || t.includes("multi-family")) &&
    (t.includes("supply") || t.includes("vacancy") || t.includes("demand"));
  if (isMultifamilySignal && assetType) {
    const a = assetType.toLowerCase();
    if (a.includes("office") || a.includes("retail")) return false;
  }
  return true;
}

/**
 * Select and dedupe macro signals for PDF: per-risk cap (2), overall cap (5), relevance filtering.
 * If only generic placeholders remain, show at most one. Returns ordered list for section.
 */
export function selectMacroSignalsForPdf(params: {
  linksWithRisk: LinkWithRisk[];
  assetType: string | null;
  market: string | null;
  maxPerRisk?: number;
  maxOverall?: number;
}): MacroSignalRow[] {
  const { linksWithRisk, assetType, market, maxPerRisk = MAX_SIGNALS_PER_RISK, maxOverall = MAX_SIGNALS_OVERALL } = params;
  const byRisk = new Map<string, typeof linksWithRisk>();
  for (const link of linksWithRisk) {
    if (!signalAppliesToDeal(link.signal_type ?? "", assetType, market)) continue;
    const list = byRisk.get(link.deal_risk_id) ?? [];
    list.push(link);
    byRisk.set(link.deal_risk_id, list);
  }
  const riskTypes = new Map(linksWithRisk.map((l) => [l.deal_risk_id, l.risk_type]));
  const picked: LinkWithRisk[] = [];
  for (const [riskId, list] of byRisk) {
    const riskType = riskTypes.get(riskId) ?? "";
    const scored = list
      .map((l) => ({ link: l, score: signalRelevanceForRisk(l.signal_type ?? "", riskType) }))
      .sort((a, b) => b.score - a.score);
    const seenKey = new Set<string>();
    let count = 0;
    for (const { link } of scored) {
      if (count >= maxPerRisk) break;
      const key = signalStableKey(link.signal_type, link.what_changed ?? link.link_reason);
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      picked.push(link);
      count++;
    }
  }
  const deduped = dedupeSignals(
    picked.map((l) => ({
      signal_id: l.signal_id,
      link_reason: l.link_reason,
      signal_type: l.signal_type,
      what_changed: l.what_changed,
    })),
    maxOverall
  );
  const isGeneric = (row: MacroSignalRow) => {
    const t = (row.display_text ?? "").toLowerCase();
    return t.includes("generic") || t === "signal" || t.length < 15;
  };
  const generic = deduped.filter(isGeneric);
  const specific = deduped.filter((r) => !isGeneric(r));
  if (specific.length > 0) return specific;
  if (generic.length > 0) return generic.slice(0, 1);
  return [];
}

/**
 * One sentence: take first sentence or first ~100 chars.
 */
export function oneSentence(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  const trimmed = text.trim();
  const dot = trimmed.indexOf(".");
  if (dot !== -1) return trimmed.slice(0, dot + 1).trim();
  return trimmed.slice(0, 100).trim() + (trimmed.length > 100 ? "…" : "");
}

/**
 * Imperative diligence action (1 sentence). Use recommended_action or "Monitor."
 */
export function diligenceAction(recommended_action: string | null | undefined): string {
  if (recommended_action != null && typeof recommended_action === "string") {
    const t = recommended_action.trim();
    if (t.length > 0) return oneSentence(t);
  }
  return "Monitor.";
}
