/**
 * Score↔band consistency: canonical band must come from riskIndex.scoreToBand(score).
 * Use this to detect when stored band diverges from the score (e.g. version drift or bug).
 */

import { scoreToBand, RISK_INDEX_VERSION } from "./riskIndex";

export type BandConsistencyResult = {
  mismatch: boolean;
  expectedBand?: string;
};

const VALID_BANDS = new Set<string>(["Low", "Moderate", "Elevated", "High"]);

/**
 * Checks whether the stored band matches the band that scoreToBand(score) would produce
 * for the same risk index version. Only runs when the scan's risk_index_version matches
 * the current RISK_INDEX_VERSION (otherwise different thresholds may apply).
 */
export function checkBandConsistency(
  score: number | null,
  storedBand: string | null,
  riskIndexVersion: string | null
): BandConsistencyResult {
  if (score == null || typeof score !== "number" || Number.isNaN(score)) {
    return { mismatch: false };
  }
  const band = storedBand?.trim();
  if (!band || !VALID_BANDS.has(band)) {
    return { mismatch: false };
  }
  // Only assert when scan was produced with current version
  const versionMatch =
    riskIndexVersion != null &&
    riskIndexVersion.trim() !== "" &&
    riskIndexVersion.trim() === RISK_INDEX_VERSION.trim();
  if (!versionMatch) {
    return { mismatch: false };
  }
  const expectedBand = scoreToBand(score);
  const mismatch = expectedBand !== band;
  return mismatch ? { mismatch: true, expectedBand } : { mismatch: false };
}
