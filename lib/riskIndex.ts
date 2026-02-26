/**
 * CRE Signal Risk Index™ — recalibrated balanced scoring.
 * Final Score = Base + Risk Penalties - Stabilizers.
 * Bands: 0–34 Low, 35–49 Moderate, 50–64 Elevated, 65+ High.
 */

import type { DealScanAssumptions } from "./dealScanContract";

export type RiskIndexBand = "Low" | "Moderate" | "Elevated" | "High";

export type RiskIndexBreakdown = {
  structural_weight: number;
  market_weight: number;
  confidence_factor: number;
  stabilizer_benefit: number;
  penalty_total: number;
};

export type RiskIndexResult = {
  score: number;
  band: RiskIndexBand;
  breakdown: RiskIndexBreakdown;
};

/** Structural risk types (capital structure, debt, refi). Used for DataMissing cap rule. */
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

const SEVERITY_POINTS: Record<string, number> = {
  High: 8,
  Medium: 4,
  Low: 2,
};

const CONFIDENCE_FACTOR: Record<string, number> = {
  High: 1,
  Medium: 0.7,
  Low: 0.4,
};

const BASE_SCORE = 40;
const STABILIZER_CAP = 20;
const MACRO_PENALTY_CAP = 5;

/** Severity bands (recalibrated). */
function scoreToBand(score: number): RiskIndexBand {
  if (score <= 34) return "Low";
  if (score <= 49) return "Moderate";
  if (score <= 64) return "Elevated";
  return "High";
}

function getAssumptionValue(
  assumptions: DealScanAssumptions | undefined,
  key: keyof DealScanAssumptions
): number | null {
  const cell = assumptions?.[key];
  if (cell == null || typeof cell !== "object") return null;
  const v = (cell as { value?: number | null }).value;
  return v != null && typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/**
 * Stabilizers (negative scoring). Cap total benefit at STABILIZER_CAP.
 */
function computeStabilizers(assumptions: DealScanAssumptions | undefined): number {
  let total = 0;

  const ltv = getAssumptionValue(assumptions, "ltv");
  if (ltv != null) {
    if (ltv <= 60) total += 8;
    else if (ltv <= 65) total += 4;
  }

  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  if (exitCap != null && capRateIn != null && exitCap >= capRateIn) {
    total += 6;
  }

  // Fixed-rate debt ≥7y, DSCR ≥1.6x, vacancy ≤ market, anchor >10y: not in current assumption keys; omit
  return Math.min(total, STABILIZER_CAP);
}

/**
 * Per-risk penalties with caps and conditions.
 * Returns { penalty, isDataMissingOnly, isExpenseGrowthMissing } for DataMissing cap rule.
 */
function computePenalties(
  risks: RiskRow[],
  assumptions: DealScanAssumptions | undefined
): {
  total: number;
  onlyDataMissingOrExpense: boolean;
  structuralRiskCount: number;
} {
  const ltv = getAssumptionValue(assumptions, "ltv");
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  const hasExpenseGrowth = getAssumptionValue(assumptions, "expense_growth") != null;
  const hasDebtRate = getAssumptionValue(assumptions, "debt_rate") != null;

  let total = 0;
  let dataMissingOrExpenseCount = 0;
  let otherRiskCount = 0;
  let structuralCount = 0;

  for (const r of risks) {
    const conf = CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4;
    const sevPoints = SEVERITY_POINTS[r.severity_current] ?? 2;

    if (STRUCTURAL_RISK_TYPES.has(r.risk_type)) structuralCount += 1;

    switch (r.risk_type) {
      case "DataMissing":
        total += Math.min(sevPoints * conf, 3);
        dataMissingOrExpenseCount += 1;
        break;
      case "ExpenseUnderstated":
        if (!hasExpenseGrowth) total += Math.min(sevPoints * conf, 3);
        dataMissingOrExpenseCount += 1;
        break;
      case "DebtCostRisk":
        if (hasDebtRate === false && ltv != null && ltv > 65) {
          total += Math.min(4 * conf, 4);
        } else {
          total += Math.min(sevPoints * conf, 6);
        }
        otherRiskCount += 1;
        break;
      case "ExitCapCompression":
        if (
          exitCap != null &&
          capRateIn != null &&
          capRateIn - exitCap > 0.25
        ) {
          total += Math.min(sevPoints * conf, 8);
        }
        otherRiskCount += 1;
        break;
      case "RentGrowthAggressive":
        total += Math.min(sevPoints * conf, 6);
        otherRiskCount += 1;
        break;
      case "RefiRisk":
      case "MarketLiquidityRisk":
      case "InsuranceRisk":
      case "ConstructionTimingRisk":
      case "RegulatoryPolicyExposure":
      case "VacancyUnderstated":
      default:
        total += Math.min(sevPoints * conf, 6);
        otherRiskCount += 1;
        break;
    }
  }

  const onlyDataMissingOrExpense =
    dataMissingOrExpenseCount > 0 && otherRiskCount === 0;

  return {
    total,
    onlyDataMissingOrExpense,
    structuralRiskCount: structuralCount,
  };
}

export type ComputeRiskIndexParams = {
  risks: RiskRow[];
  assumptions?: DealScanAssumptions;
  /** Number of risks that have a linked macro signal (overlay). Capped at +5 total. */
  macroLinkedCount?: number;
  _promptVersion?: string | null;
};

/**
 * Compute CRE Signal Risk Index™: Base 40 + Penalties - Stabilizers.
 * DataMissing alone cannot push above Moderate without at least two structural risks.
 */
export function computeRiskIndex(
  params: ComputeRiskIndexParams | RiskRow[],
  _promptVersion?: string | null
): RiskIndexResult {
  const risks = Array.isArray(params) ? params : params.risks;
  const assumptions =
    Array.isArray(params) ? undefined : (params as ComputeRiskIndexParams).assumptions;
  const macroLinkedCount = Array.isArray(params)
    ? 0
    : (params as ComputeRiskIndexParams).macroLinkedCount ?? 0;

  const stabilizerBenefit = computeStabilizers(assumptions);
  const {
    total: penaltyTotal,
    onlyDataMissingOrExpense,
    structuralRiskCount,
  } = computePenalties(risks, assumptions);

  const macroPenalty = Math.min(macroLinkedCount * 2, MACRO_PENALTY_CAP);
  let rawScore = BASE_SCORE + penaltyTotal + macroPenalty - stabilizerBenefit;

  if (
    onlyDataMissingOrExpense &&
    structuralRiskCount < 2 &&
    rawScore > 49
  ) {
    rawScore = 49;
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const band = scoreToBand(score);

  const structuralRaw = risks
    .filter((r) => STRUCTURAL_RISK_TYPES.has(r.risk_type))
    .reduce(
      (sum, r) =>
        sum +
        (SEVERITY_POINTS[r.severity_current] ?? 2) *
          (CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4),
      0
    );
  const marketRaw = risks
    .filter((r) => !STRUCTURAL_RISK_TYPES.has(r.risk_type))
    .reduce(
      (sum, r) =>
        sum +
        (SEVERITY_POINTS[r.severity_current] ?? 2) *
          (CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4),
      0
    );
  const totalConfidence = risks.reduce(
    (s, r) => s + (CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4),
    0
  );
  const count = risks.length || 1;

  return {
    score,
    band,
    breakdown: {
      structural_weight: Math.min(
        100,
        Math.round((structuralRaw / (count * 8)) * 100)
      ),
      market_weight: Math.min(100, Math.round((marketRaw / (count * 8)) * 100)),
      confidence_factor: Math.round((totalConfidence / count) * 100) / 100,
      stabilizer_benefit: stabilizerBenefit,
      penalty_total: penaltyTotal,
    },
  };
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
