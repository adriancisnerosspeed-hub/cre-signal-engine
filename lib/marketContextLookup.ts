import marketData from "./data/marketContext.json";

export type MarketContext = {
  office_vacancy_range: string;
  office_cap_rate_range: string;
  multifamily_cap_rate_range: string;
  industrial_cap_rate_range: string;
  retail_cap_rate_range: string;
  market_trend: string;
  last_updated: string;
  notes: string;
};

// Explicit aliases that need non-obvious mapping
const ALIASES: Record<string, string> = {
  "new york":      "nyc",
  "new york city": "nyc",
  "nyc":           "nyc",
  "ny":            "nyc",
  "washington dc": "washington",
  "washington, dc":"washington",
  "dc":            "washington",
  "la":            "los angeles",
};

export function lookupMarketContext(market: string | null | undefined): MarketContext | null {
  if (!market) return null;
  const lower = market.toLowerCase().trim();

  // Check explicit aliases first (longest match wins)
  for (const alias of Object.keys(ALIASES).sort((a, b) => b.length - a.length)) {
    if (lower.includes(alias)) {
      const key = ALIASES[alias];
      return (marketData as Record<string, MarketContext>)[key] ?? null;
    }
  }

  // Fuzzy match: first word of the market string against each key's first word
  const firstWord = lower.split(/[\s,]+/)[0];
  for (const key of Object.keys(marketData)) {
    if (key.split(" ")[0] === firstWord) {
      return (marketData as Record<string, MarketContext>)[key];
    }
  }

  return null;
}

/** Returns the relevant cap rate range for the given asset type. */
export function capRateForAssetType(ctx: MarketContext, assetType: string | null | undefined): string {
  const lower = (assetType ?? "").toLowerCase();
  if (lower.includes("multifamily") || lower.includes("apartment") || lower.includes("residential")) {
    return ctx.multifamily_cap_rate_range;
  }
  if (lower.includes("industrial") || lower.includes("warehouse") || lower.includes("logistics") || lower.includes("flex")) {
    return ctx.industrial_cap_rate_range;
  }
  if (lower.includes("retail") || lower.includes("shopping") || lower.includes("strip")) {
    return ctx.retail_cap_rate_range;
  }
  // Default to office (also covers "office", "mixed-use", unknown)
  return ctx.office_cap_rate_range;
}
