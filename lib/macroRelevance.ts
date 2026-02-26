/**
 * Macro signal relevance filtering: only attach signals that match deal context
 * (e.g. no multifamily pipeline on industrial, no Florida insurance on Phoenix office).
 */

export type SignalContext = {
  asset_type?: string | null;
  state?: string | null;
  category?: string | null;
};

export type DealContext = {
  asset_type?: string | null;
  state?: string | null;
  /** Optional: market string (e.g. "Phoenix", "Austin") used when state not set */
  market?: string | null;
};

export function isSignalRelevant(
  signal: SignalContext,
  deal: DealContext
): boolean {
  // Asset type filter
  if (signal.asset_type && deal.asset_type) {
    const sigAsset = normalizeAssetType(signal.asset_type);
    const dealAsset = normalizeAssetType(deal.asset_type);
    if (sigAsset && dealAsset && !assetTypesMatch(sigAsset, dealAsset)) return false;
  }

  // State / market filter (state or market must match when both present)
  const dealStateOrMarket = (deal.state ?? deal.market ?? "").trim();
  if (signal.state && dealStateOrMarket) {
    const sigState = normalizeState(signal.state);
    const dealNorm = normalizeState(dealStateOrMarket);
    if (sigState && dealNorm && !stateOrMarketMatch(sigState, dealNorm)) return false;
  }

  return true;
}

function normalizeAssetType(s: string): string {
  const t = s.trim().toLowerCase();
  if (t.includes("multifamily") || t.includes("multi-family") || t.includes("multifam")) return "multifamily";
  if (t.includes("office")) return "office";
  if (t.includes("retail")) return "retail";
  if (t.includes("industrial")) return "industrial";
  return t;
}

function assetTypesMatch(sig: string, deal: string): boolean {
  return sig === deal;
}

function normalizeState(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function stateOrMarketMatch(sig: string, deal: string): boolean {
  if (sig === deal) return true;
  // e.g. "phoenix, az" vs "phoenix"
  return sig.includes(deal) || deal.includes(sig);
}

/**
 * Infer SignalContext from signals table row (signal_type, what_changed).
 * Use when DB has no asset_type/state columns.
 */
export function inferSignalContext(signalType: string | null, whatChanged: string | null): SignalContext {
  const typeStr = (signalType ?? "").toLowerCase();
  const textStr = (whatChanged ?? "").toLowerCase();
  const combined = `${typeStr} ${textStr}`;

  let asset_type: string | null = null;
  if (combined.includes("multifamily") || combined.includes("multi-family") || combined.includes("multifam")) {
    asset_type = "multifamily";
  } else if (combined.includes("office")) {
    asset_type = "office";
  } else if (combined.includes("retail")) {
    asset_type = "retail";
  } else if (combined.includes("industrial")) {
    asset_type = "industrial";
  }

  // Crude state inference: e.g. "florida", "phoenix", "texas"
  let state: string | null = null;
  const stateLike = combined.match(/\b(florida|texas|phoenix|arizona|austin|california|nevada|georgia)\b/);
  if (stateLike) state = stateLike[1];

  return { asset_type, state, category: signalType };
}
