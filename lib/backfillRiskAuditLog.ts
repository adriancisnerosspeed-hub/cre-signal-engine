/**
 * Pure helpers for risk_audit_log backfill (deterministic previous score, band change).
 * Used by scripts/backfillRiskAuditLog.ts.
 */

/** Format band change for audit log; null if same or either missing. */
export function bandChange(from: string | null, to: string | null): string | null {
  if (from == null || to == null) return null;
  const a = (from || "—").trim();
  const b = (to || "—").trim();
  if (a === b) return null;
  return `${a} → ${b}`;
}

export type ScanRowForAudit = {
  id: string;
  deal_id: string;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_version: string | null;
  created_at: string;
};

/**
 * Build audit rows for backfill: one per scan, with previous_score from next scan in
 * (created_at DESC, id DESC) order. Caller should filter out scan_ids already in risk_audit_log.
 */
export function buildAuditRows(
  scansOrderedByDeal: Map<string, ScanRowForAudit[]>,
  existingScanIds: Set<string>,
  defaultVersion: string
): {
  deal_id: string;
  scan_id: string;
  previous_score: number | null;
  new_score: number;
  delta: number | null;
  band_change: string | null;
  model_version: string | null;
  created_at: string;
}[] {
  const out: {
    deal_id: string;
    scan_id: string;
    previous_score: number | null;
    new_score: number;
    delta: number | null;
    band_change: string | null;
    model_version: string | null;
    created_at: string;
  }[] = [];

  for (const [, list] of scansOrderedByDeal) {
    for (let i = 0; i < list.length; i++) {
      const scan = list[i];
      if (existingScanIds.has(scan.id)) continue;
      const score = scan.risk_index_score;
      if (score == null) continue;
      const prevScan = i + 1 < list.length ? list[i + 1] : null;
      const previousScore = prevScan?.risk_index_score ?? null;
      const prevVersion = prevScan?.risk_index_version ?? null;
      const version = (scan.risk_index_version ?? "").trim() || defaultVersion;
      const comparable = previousScore != null && (prevVersion == null || prevVersion === version);
      const delta = comparable && previousScore != null ? score - previousScore : null;
      const bandChangeVal = bandChange(prevScan?.risk_index_band ?? null, scan.risk_index_band ?? null);

      out.push({
        deal_id: scan.deal_id,
        scan_id: scan.id,
        previous_score: previousScore,
        new_score: score,
        delta,
        band_change: bandChangeVal,
        model_version: version,
        created_at: scan.created_at,
      });
    }
  }
  return out;
}
