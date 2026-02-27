/**
 * Count unique macro signals linked to a scan's risks.
 * Used for risk index macro penalty: +1 per unique signal, capped in scoring.
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
