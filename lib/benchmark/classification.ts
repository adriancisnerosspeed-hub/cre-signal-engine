/**
 * Risk band v1: percentile → SEVERE | ELEVATED | TYPICAL | LOW | VERY_LOW.
 * risk_index_v2: higher_is_worse (higher percentile = riskier).
 */

import type { RiskBandV1 } from "./types";
import { BAND_VERSION } from "./constants";

export function percentileToRiskBandV1(percentile: number): RiskBandV1 {
  if (percentile >= 90) return "SEVERE";
  if (percentile >= 75) return "ELEVATED";
  if (percentile >= 40) return "TYPICAL";
  if (percentile >= 10) return "LOW";
  return "VERY_LOW";
}

export { BAND_VERSION };
