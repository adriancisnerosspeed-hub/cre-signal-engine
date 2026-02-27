/**
 * Count unique macro signals linked to a scan's risks.
 * Used for risk index macro penalty: +1 per unique signal, capped in scoring.
 * Supports decay by timestamp: weight 1.0 <12mo, 0.5 for 12–24mo, 0.25 for >24mo.
 */

export type LinkRow = { deal_risk_id: string; signal_id: string };

/**
 * Returns COUNT(DISTINCT signal_id) for the given link rows.
 * Duplicate (deal_risk_id, signal_id) or multiple risks linking to the same signal
 * do not inflate the count.
 */
export function countUniqueMacroSignals(linkRows: LinkRow[]): number {
  const uniqueSignalIds = new Set(linkRows.map((r) => String(r.signal_id)));
  return uniqueSignalIds.size;
}

/** Link row with signal_type for category-based counting (macro penalty stability). */
export type LinkRowWithCategory = {
  deal_risk_id: string;
  signal_id: string;
  signal_type: string | null;
};

/**
 * Returns COUNT(DISTINCT signal_type) for the given link rows.
 * Multiple signals in the same category count as 1; prevents same-category links from inflating penalty.
 */
export function countUniqueMacroCategories(linkRows: LinkRowWithCategory[]): number {
  const uniqueCategories = new Set(
    linkRows
      .map((r) => (r.signal_type ?? "").trim().toLowerCase())
      .filter((s) => s.length > 0)
  );
  return uniqueCategories.size;
}

/** Link with optional timestamp (ISO string). Prefer link timestamp; fallback to signal created_at. */
export type LinkRowWithTimestamp = LinkRowWithCategory & {
  timestamp: string | null;
};

/**
 * Compute decayed macro weight for risk index: per unique category, apply age-based multiplier.
 * <12 months: 1.0, 12–24 months: 0.5, >24 months: 0.25.
 * Returns a number (e.g. 2.5) to be used as macro penalty input; when no timestamps, returns raw category count.
 */
export function computeDecayedMacroWeight(
  links: LinkRowWithTimestamp[],
  now: Date = new Date()
): number {
  const nowTime = now.getTime();
  const categoryToLatestTs = new Map<string, number>();
  for (const link of links) {
    const cat = (link.signal_type ?? "").trim().toLowerCase() || "general";
    if (!cat) continue;
    const ts = link.timestamp ? new Date(link.timestamp).getTime() : nowTime;
    const existing = categoryToLatestTs.get(cat);
    if (existing == null || ts > existing) categoryToLatestTs.set(cat, ts);
  }
  if (categoryToLatestTs.size === 0) return 0;
  let weight = 0;
  const twelveMo = 12 * 30 * 24 * 60 * 60 * 1000;
  const twentyFourMo = 24 * 30 * 24 * 60 * 60 * 1000;
  for (const ts of categoryToLatestTs.values()) {
    const age = nowTime - ts;
    if (age < twelveMo) weight += 1;
    else if (age < twentyFourMo) weight += 0.5;
    else weight += 0.25;
  }
  return weight;
}
