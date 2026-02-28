/**
 * Model governance metadata for CRE Signal Risk Index.
 * All values are sourced from lib/riskIndex.ts — no duplicated magic numbers.
 */

import {
  RISK_INDEX_VERSION,
  RISK_INDEX_V2_LOCKED_AT,
  STRUCTURAL_WEIGHT_FLOOR_PCT,
  MARKET_WEIGHT_CAP_PCT,
  MACRO_PENALTY_CAP,
  MAX_DRIVER_SHARE_PCT,
  RAMP_COMPRESSION_START_PCT,
  RAMP_COMPRESSION_END_PCT,
  RAMP_COMPRESSION_TIER_OVERRIDE_PCT,
  RAMP_DSCR_SAFE,
  RAMP_DSCR_FLOOR,
  RAMP_DSCR_TIER_OVERRIDE,
  RAMP_LTV_LOW,
  RAMP_LTV_MID,
  RAMP_LTV_HIGH,
  RAMP_VACANCY_LOW,
  RAMP_VACANCY_MID,
  RAMP_VACANCY_HIGH,
} from "./riskIndex";

export type RiskModelMetadata = {
  version: string;
  created_at: string;
  structural_weight: number;
  market_weight: number;
  macro_cap: number;
  driver_share_cap: number;
  ramp_thresholds: {
    ltv: { low: number; mid: number; high: number };
    vacancy: { low: number; mid: number; high: number };
    dscr: { safe: number; floor: number; tier_override: number };
    compression: { start_pct: number; end_pct: number; tier_override_pct: number };
  };
};

/**
 * Returns governance metadata for the current risk model.
 * Values are pulled from riskIndex constants; changing any constant will change this output.
 */
export function getRiskModelMetadata(): RiskModelMetadata {
  return {
    version: RISK_INDEX_VERSION,
    created_at: RISK_INDEX_V2_LOCKED_AT,
    structural_weight: STRUCTURAL_WEIGHT_FLOOR_PCT,
    market_weight: MARKET_WEIGHT_CAP_PCT,
    macro_cap: MACRO_PENALTY_CAP,
    driver_share_cap: MAX_DRIVER_SHARE_PCT,
    ramp_thresholds: {
      ltv: { low: RAMP_LTV_LOW, mid: RAMP_LTV_MID, high: RAMP_LTV_HIGH },
      vacancy: { low: RAMP_VACANCY_LOW, mid: RAMP_VACANCY_MID, high: RAMP_VACANCY_HIGH },
      dscr: { safe: RAMP_DSCR_SAFE, floor: RAMP_DSCR_FLOOR, tier_override: RAMP_DSCR_TIER_OVERRIDE },
      compression: {
        start_pct: RAMP_COMPRESSION_START_PCT,
        end_pct: RAMP_COMPRESSION_END_PCT,
        tier_override_pct: RAMP_COMPRESSION_TIER_OVERRIDE_PCT,
      },
    },
  };
}
