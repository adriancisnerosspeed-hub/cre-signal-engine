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
