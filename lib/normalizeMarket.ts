/**
 * Single source of truth for canonical market keys. Ensures Exposure by Market
 * never shows duplicates (e.g. "Dallas, TX" vs "Dallas, Tx" vs "Dallas, Texas").
 */

/** 2-letter lowercase -> USPS abbreviation (all 50 + DC). */
const STATE_ABBR: Record<string, string> = {
  al: "AL", ak: "AK", az: "AZ", ar: "AR", ca: "CA", co: "CO", ct: "CT",
  de: "DE", fl: "FL", ga: "GA", hi: "HI", id: "ID", il: "IL", in: "IN",
  ia: "IA", ks: "KS", ky: "KY", la: "LA", me: "ME", md: "MD", ma: "MA",
  mi: "MI", mn: "MN", ms: "MS", mo: "MO", mt: "MT", ne: "NE", nv: "NV",
  nh: "NH", nj: "NJ", nm: "NM", ny: "NY", nc: "NC", nd: "ND", oh: "OH",
  ok: "OK", or: "OR", pa: "PA", ri: "RI", sc: "SC", sd: "SD", tn: "TN",
  tx: "TX", ut: "UT", vt: "VT", va: "VA", wa: "WA", wv: "WV", wi: "WI",
  wy: "WY", dc: "DC",
};

/** Full state name (lowercase) -> USPS abbreviation. */
const STATE_FULL: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", "washington dc": "DC", "d.c.": "DC",
};

function trimAndCollapse(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/[,.]+\s*$/, "").trim();
}

/**
 * Returns 2-letter USPS state abbreviation (uppercase), or null if empty.
 * Handles: "tx", "TX", "Texas", "texas", "Tx.", "TEXAS".
 */
export function normalizeState(input: string | null | undefined): string | null {
  if (input == null || typeof input !== "string") return null;
  const s = trimAndCollapse(input).toLowerCase();
  if (!s) return null;
  const two = s.length === 2 ? s : null;
  if (two && STATE_ABBR[two]) return STATE_ABBR[two];
  if (STATE_FULL[s]) return STATE_FULL[s];
  if (two) return two.toUpperCase();
  return null;
}

/** Title-case city; preserves "Ft.", "St.", etc. */
function titleWord(w: string): string {
  if (!w.length) return w;
  const lower = w.toLowerCase();
  if (lower === "st" || lower === "st.") return "St.";
  if (lower === "ft" || lower === "ft.") return "Ft.";
  if (lower === "mt") return "Mt.";
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Returns Title Case city for display, or null if empty.
 * Handles: "dallas" -> "Dallas", " Fort   Worth " -> "Fort Worth", "st. petersburg" -> "St. Petersburg".
 */
export function normalizeCity(input: string | null | undefined): string | null {
  if (input == null || typeof input !== "string") return null;
  const s = trimAndCollapse(input);
  if (!s) return null;
  return s.split(" ").map(titleWord).join(" ");
}

/**
 * Parse a single market string into city and state-ish parts.
 * Accepts: "City, ST", "City, StateName", "City ST", "City Texas".
 */
function parseMarketString(market: string): { city: string; stateRaw: string } {
  const raw = trimAndCollapse(market);
  if (raw.includes(",")) {
    const idx = raw.indexOf(",");
    const city = raw.slice(0, idx).trim();
    const stateRaw = raw.slice(idx + 1).trim();
    return { city, stateRaw };
  }
  const parts = raw.split(" ");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const maybeState = last?.replace(/[.,]/g, "") ?? "";
    const is2Letter = maybeState.length === 2;
    const isFullName = maybeState.length > 2 && STATE_FULL[maybeState.toLowerCase()];
    if (is2Letter || isFullName) {
      const city = parts.slice(0, -1).join(" ");
      return { city, stateRaw: last ?? "" };
    }
  }
  return { city: raw, stateRaw: "" };
}

export type NormalizeMarketInput = {
  city?: string | null;
  state?: string | null;
  market?: string | null;
};

export type NormalizeMarketResult = {
  city: string | null;
  state: string | null;
  market_key: string | null;
  market_label: string | null;
};

/**
 * Single source of truth: from city/state or a single market string, produce
 * normalized city, state, market_key (for grouping), and market_label (for UI).
 * market_key = lower(city) + "|" + state_abbrev so grouping is deterministic.
 */
export function normalizeMarket(input: NormalizeMarketInput): NormalizeMarketResult {
  let city: string | null = null;
  let state: string | null = null;

  const hasExplicit = (input.city != null && trimAndCollapse(String(input.city)) !== "") ||
    (input.state != null && trimAndCollapse(String(input.state)) !== "");
  if (hasExplicit) {
    city = normalizeCity(input.city);
    state = normalizeState(input.state);
  }
  const marketStr = input.market != null ? trimAndCollapse(String(input.market)) : "";
  if (marketStr && !city && !state) {
    const parsed = parseMarketString(marketStr);
    city = normalizeCity(parsed.city);
    state = normalizeState(parsed.stateRaw);
  }
  if (!city && marketStr && !state) {
    city = normalizeCity(marketStr);
  }

  if (!city && !state) {
    return { city: null, state: null, market_key: null, market_label: null };
  }

  const cityNorm = city ?? "";
  const stateAbbr = state ?? "";
  const market_key = stateAbbr
    ? `${cityNorm.toLowerCase()}|${stateAbbr}`
    : (cityNorm ? `${cityNorm.toLowerCase()}|` : null);
  const market_label = stateAbbr
    ? `${cityNorm || "Unknown"}, ${stateAbbr}`
    : (cityNorm || null);

  return {
    city: cityNorm || null,
    state: stateAbbr || null,
    market_key,
    market_label,
  };
}

/**
 * For exposure grouping: when DB has market_key use it; otherwise derive from market string.
 */
export function exposureMarketKey(row: { market_key?: string | null; market?: string | null }): string {
  if (row.market_key != null && row.market_key !== "") return row.market_key;
  const result = normalizeMarket({ market: row.market ?? null });
  return result.market_key ?? "unspecified";
}

/**
 * For exposure display label: when DB has market_label use it; otherwise derive.
 */
export function exposureMarketLabel(row: { market_label?: string | null; market?: string | null }): string {
  if (row.market_label != null && row.market_label !== "") return row.market_label;
  const result = normalizeMarket({ market: row.market ?? null });
  return result.market_label ?? "Unspecified";
}
