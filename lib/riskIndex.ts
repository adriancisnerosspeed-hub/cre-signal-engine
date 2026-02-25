/**
 * CRE Signal Risk Index™ — single server-side utility.
 * Deterministic, version-aware (prompt_version may be used in future formula versions).
 * Formula is isolated: changes apply only to new scans; historical scores are stored and never recomputed.
 */

export type RiskIndexBand = "Low" | "Moderate" | "Elevated" | "High";

export type RiskIndexBreakdown = {
  structural_weight: number;
  market_weight: number;
  confidence_factor: number;
};

export type RiskIndexResult = {
  score: number;
  band: RiskIndexBand;
  breakdown: RiskIndexBreakdown;
};

/** Risk types that contribute to "structural" (capital structure, debt, refi) vs "market" (exit, rent, vacancy, supply). */
const STRUCTURAL_RISK_TYPES = new Set([
  "RefiRisk",
  "DebtCostRisk",
  "MarketLiquidityRisk",
  "InsuranceRisk",
  "ConstructionTimingRisk",
]);

type RiskRow = {
  severity_current: string;
  confidence: string | null;
  risk_type: string;
};

const SEVERITY_WEIGHT: Record<string, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

const CONFIDENCE_WEIGHT: Record<string, number> = {
  High: 1,
  Medium: 0.7,
  Low: 0.4,
};

function severityWeight(s: string): number {
  return SEVERITY_WEIGHT[s] ?? 1;
}

function confidenceWeight(s: string | null): number {
  if (!s) return 0.4;
  return CONFIDENCE_WEIGHT[s] ?? 0.4;
}

/**
 * Compute CRE Signal Risk Index™ from deal_risks rows.
 * @param risks — Array of risk rows (severity_current, confidence, risk_type)
 * @param _promptVersion — Reserved for future version-aware formula; currently unused
 */
export function computeRiskIndex(
  risks: RiskRow[],
  _promptVersion?: string | null
): RiskIndexResult {
  let structuralRaw = 0;
  let marketRaw = 0;
  let totalConfidence = 0;
  let count = 0;

  for (const r of risks) {
    const sev = severityWeight(r.severity_current);
    const conf = confidenceWeight(r.confidence);
    const weighted = sev * conf;
    totalConfidence += conf;
    count += 1;
    if (STRUCTURAL_RISK_TYPES.has(r.risk_type)) {
      structuralRaw += weighted;
    } else {
      marketRaw += weighted;
    }
  }

  const structuralMax = count * 3 * 1;
  const marketMax = count * 3 * 1;
  const structuralWeight =
    structuralMax > 0 ? Math.min(100, Math.round((structuralRaw / structuralMax) * 100)) : 0;
  const marketWeight =
    marketMax > 0 ? Math.min(100, Math.round((marketRaw / marketMax) * 100)) : 0;
  const confidenceFactor = count > 0 ? totalConfidence / count : 0.4;

  const rawScore = (structuralRaw + marketRaw) / (count || 1);
  const maxPerRisk = 3 * 1;
  const score = Math.min(100, Math.round((rawScore / maxPerRisk) * 100));

  const band = scoreToBand(score);

  return {
    score,
    band,
    breakdown: {
      structural_weight: structuralWeight,
      market_weight: marketWeight,
      confidence_factor: Math.round(confidenceFactor * 100) / 100,
    },
  };
}

function scoreToBand(score: number): RiskIndexBand {
  if (score <= 25) return "Low";
  if (score <= 50) return "Moderate";
  if (score <= 75) return "Elevated";
  return "High";
}

/**
 * Compare current scan score to previous scan score for trend.
 */
export function getRiskTrend(
  currentScore: number | null,
  previousScore: number | null
): "increased" | "decreased" | "stable" | null {
  if (currentScore == null || previousScore == null) return null;
  const delta = currentScore - previousScore;
  if (delta > 0) return "increased";
  if (delta < 0) return "decreased";
  return "stable";
}
