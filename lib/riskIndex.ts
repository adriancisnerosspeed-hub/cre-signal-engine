/**
 * CRE Signal Risk Index™ — v2.0 institutional-grade scoring.
 * Final Score = Base + Risk Penalties - Stabilizers.
 * Bands: 0–34 Low, 35–54 Moderate, 55–69 Elevated, 70+ High.
 *
 * Robustness: deterministic (same inputs → same score), uses only normalized
 * structured inputs (severity weights + macro adjustment + missing-data penalty).
 * Satisfies boundedness (0–100), stability (no randomness), and explainability
 * via breakdown (structural_weight, market_weight, contributions, top_drivers, etc.).
 */

import type { DealScanAssumptions } from "./dealScanContract";

export type RiskIndexBand = "Low" | "Moderate" | "Elevated" | "High";

export type RiskIndexBreakdown = {
  structural_weight: number;
  market_weight: number;
  confidence_factor: number;
  stabilizer_benefit: number;
  penalty_total: number;
  /** Numeric contribution per risk driver (e.g. leverage, vacancy, compression, market, missing). */
  contributions?: { driver: string; points: number }[];
  /** Percentage of total contribution per driver. */
  contribution_pct?: { driver: string; pct: number }[];
  /** Top 3 risk drivers by absolute points. */
  top_drivers?: string[];
  /** True when overall confidence is low (e.g. < 0.70). */
  review_flag?: boolean;
};

export type RiskIndexResult = {
  score: number;
  band: RiskIndexBand;
  breakdown: RiskIndexBreakdown;
};

/** Structural risk types (capital structure, debt, refi). Used for DataMissing cap rule. */
export const STRUCTURAL_RISK_TYPES = new Set([
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

export const SEVERITY_POINTS: Record<string, number> = {
  High: 8,
  Medium: 4,
  Low: 2,
};

export const CONFIDENCE_FACTOR: Record<string, number> = {
  High: 1,
  Medium: 0.7,
  Low: 0.4,
};

const BASE_SCORE = 40;
const STABILIZER_CAP = 20;
/** +1 per unique macro signal/category; cap so macro amplifies risk slightly, not dominates. */
const MACRO_PENALTY_CAP = 3;

/** Scoring logic version; stored on each scan for defensibility (e.g. older scans used older logic). */
export const RISK_INDEX_VERSION = "2.0";

/** Severity bands (v2.0: Low 0–34, Moderate 35–54, Elevated 55–69, High 70+). */
export function scoreToBand(score: number): RiskIndexBand {
  if (score <= 34) return "Low";
  if (score <= 54) return "Moderate";
  if (score <= 69) return "Elevated";
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
 * Exit cap compression: when exit_cap < cap_rate_in, compression = cap_rate_in - exit_cap (% points).
 * Penalty when >= 0.5%; tier override to minimum Elevated when >= 1.0%.
 */
function getExitCapCompression(
  assumptions: DealScanAssumptions | undefined
): { compression: number; penalty: number } {
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  if (
    exitCap == null ||
    capRateIn == null ||
    exitCap >= capRateIn
  ) {
    return { compression: 0, penalty: 0 };
  }
  const compression = capRateIn - exitCap;
  let penalty = 0;
  if (compression >= 1.0) penalty = 5;
  else if (compression >= 0.5) penalty = 3;
  return { compression, penalty };
}

/**
 * LTV + vacancy interaction: add penalty when both elevated; tier overrides at higher thresholds.
 */
function getLtvVacancyInteraction(
  assumptions: DealScanAssumptions | undefined
): { penalty: number; forceMinBand: RiskIndexBand | null } {
  const ltv = getAssumptionValue(assumptions, "ltv");
  const vacancy = getAssumptionValue(assumptions, "vacancy");
  if (ltv == null || vacancy == null) return { penalty: 0, forceMinBand: null };
  if (ltv >= 85 && vacancy >= 35) return { penalty: 8, forceMinBand: "High" };
  if (ltv >= 80 && vacancy >= 30) return { penalty: 5, forceMinBand: "Elevated" };
  if (ltv >= 75 && vacancy >= 20) return { penalty: 3, forceMinBand: null };
  return { penalty: 0, forceMinBand: null };
}

/**
 * DSCR approximation: debt_amount = LTV * purchase_price, annual_debt_service = debt_amount * debt_rate (%),
 * DSCR = NOI / annual_debt_service. If debt_rate missing, do not compute. If DSCR < 1.25 add penalty; if < 1.10 force Elevated.
 */
function getDscrPenalty(
  assumptions: DealScanAssumptions | undefined
): { penalty: number; forceMinBand: RiskIndexBand | null } {
  const purchasePrice = getAssumptionValue(assumptions, "purchase_price");
  const noi = getAssumptionValue(assumptions, "noi_year1");
  const ltv = getAssumptionValue(assumptions, "ltv");
  const debtRate = getAssumptionValue(assumptions, "debt_rate");
  if (
    purchasePrice == null ||
    purchasePrice <= 0 ||
    noi == null ||
    ltv == null ||
    debtRate == null
  ) {
    return { penalty: 0, forceMinBand: null };
  }
  const debtAmount = (ltv / 100) * purchasePrice;
  const annualDebtService = debtAmount * (debtRate / 100);
  if (annualDebtService <= 0) return { penalty: 0, forceMinBand: null };
  const dscr = noi / annualDebtService;
  if (dscr >= 1.25) return { penalty: 0, forceMinBand: null };
  if (dscr < 1.1) return { penalty: 6, forceMinBand: "Elevated" };
  return { penalty: 3, forceMinBand: null };
}

/**
 * Per-risk penalties with caps and conditions.
 * Returns { total, structuralTotal, marketTotal, onlyDataMissingOrExpense, structuralRiskCount, missingOnlyPenalty, hasStructuralHighSeverity } for DataMissing cap rule and structural/market rebalance.
 */
function computePenalties(
  risks: RiskRow[],
  assumptions: DealScanAssumptions | undefined
): {
  total: number;
  structuralTotal: number;
  marketTotal: number;
  onlyDataMissingOrExpense: boolean;
  structuralRiskCount: number;
  missingOnlyPenalty: number;
  hasStructuralHighSeverity: boolean;
} {
  const ltv = getAssumptionValue(assumptions, "ltv");
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  const hasExpenseGrowth = getAssumptionValue(assumptions, "expense_growth") != null;
  const hasDebtRate = getAssumptionValue(assumptions, "debt_rate") != null;

  let total = 0;
  let structuralTotal = 0;
  let marketTotal = 0;
  let dataMissingOrExpenseCount = 0;
  let otherRiskCount = 0;
  let structuralCount = 0;
  let missingOnlyPenalty = 0;
  let hasStructuralHighSeverity = false;

  for (const r of risks) {
    const conf = CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4;
    const sevPoints = SEVERITY_POINTS[r.severity_current] ?? 2;
    const isStructural = STRUCTURAL_RISK_TYPES.has(r.risk_type);
    const points = (() => {
      switch (r.risk_type) {
        case "DataMissing": {
          const pts = Math.min(sevPoints * conf, 3);
          missingOnlyPenalty += pts;
          return pts;
        }
        case "ExpenseUnderstated": {
          if (!hasExpenseGrowth) {
            const pts = Math.min(sevPoints * conf, 3);
            missingOnlyPenalty += pts;
            return pts;
          }
          return 0;
        }
        case "DebtCostRisk":
          return hasDebtRate === false && ltv != null && ltv > 65
            ? Math.min(4 * conf, 4)
            : Math.min(sevPoints * conf, 6);
        case "ExitCapCompression":
          return exitCap != null && capRateIn != null && capRateIn - exitCap > 0.5
            ? Math.min(sevPoints * conf, 8)
            : 0;
        case "RentGrowthAggressive":
          return Math.min(sevPoints * conf, 6);
        default:
          return Math.min(sevPoints * conf, 6);
      }
    })();

    if (isStructural) {
      structuralCount += 1;
      if (r.severity_current === "High") hasStructuralHighSeverity = true;
      structuralTotal += points;
    } else {
      marketTotal += points;
    }

    if (r.risk_type === "DataMissing" || r.risk_type === "ExpenseUnderstated") {
      dataMissingOrExpenseCount += 1;
    } else {
      otherRiskCount += 1;
    }
    total += points;
  }

  const onlyDataMissingOrExpense =
    dataMissingOrExpenseCount > 0 && otherRiskCount === 0;

  return {
    total,
    structuralTotal,
    marketTotal,
    onlyDataMissingOrExpense,
    structuralRiskCount: structuralCount,
    missingOnlyPenalty,
    hasStructuralHighSeverity,
  };
}

export type ComputeRiskIndexParams = {
  risks: RiskRow[];
  assumptions?: DealScanAssumptions;
  /** Number of risks that have a linked macro signal (overlay). Capped in scoring. Used when macroDecayedWeight not provided. */
  macroLinkedCount?: number;
  /** When provided, use decayed macro weight instead of macroLinkedCount (e.g. from computeDecayedMacroWeight). */
  macroDecayedWeight?: number;
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
  const macroDecayedWeight = Array.isArray(params)
    ? undefined
    : (params as ComputeRiskIndexParams).macroDecayedWeight;

  const stabilizerBenefit = computeStabilizers(assumptions);
  const {
    total: penaltyTotal,
    structuralTotal,
    marketTotal,
    onlyDataMissingOrExpense,
    structuralRiskCount,
    missingOnlyPenalty,
    hasStructuralHighSeverity,
  } = computePenalties(risks, assumptions);

  const macroPenalty = Math.min(
    macroDecayedWeight != null ? macroDecayedWeight : macroLinkedCount * 1,
    MACRO_PENALTY_CAP
  );

  // Structural/market rebalance: market contribution capped at 35% of total risk contribution
  const totalRaw = structuralTotal + marketTotal;
  const marketCapped =
    totalRaw > 0 ? Math.min(marketTotal, 0.35 * totalRaw) : marketTotal;
  const effectivePenalty = structuralTotal + marketCapped;

  let effectivePenaltyForScore = effectivePenalty;
  if (
    onlyDataMissingOrExpense &&
    !hasStructuralHighSeverity
  ) {
    effectivePenaltyForScore = Math.min(effectivePenalty, 15);
  }
  let rawScore = BASE_SCORE + effectivePenaltyForScore + macroPenalty - stabilizerBenefit;

  if (
    onlyDataMissingOrExpense &&
    !hasStructuralHighSeverity &&
    rawScore > 49
  ) {
    rawScore = 49;
  }

  const totalConfidence = risks.reduce(
    (s, r) => s + (CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4),
    0
  );
  const count = risks.length || 1;
  const overallConfidence = count > 0 ? totalConfidence / count : 0.5;
  let review_flag = false;
  if (overallConfidence < 0.7) {
    review_flag = true;
    rawScore += 3;
  } else if (overallConfidence >= 0.9) {
    rawScore -= 1;
  }

  const { compression: exitCompression, penalty: compressionPenalty } =
    getExitCapCompression(assumptions);
  rawScore += compressionPenalty;

  const { penalty: ltvVacancyPenalty, forceMinBand: ltvVacancyMinBand } =
    getLtvVacancyInteraction(assumptions);
  rawScore += ltvVacancyPenalty;

  const { penalty: dscrPenalty, forceMinBand: dscrMinBand } =
    getDscrPenalty(assumptions);
  rawScore += dscrPenalty;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  let band = scoreToBand(score);
  if (exitCompression >= 1.0) {
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const elevatedIdx = order.indexOf("Elevated");
    if (bandIdx < elevatedIdx) band = "Elevated";
  }
  if (ltvVacancyMinBand) {
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const minIdx = order.indexOf(ltvVacancyMinBand);
    if (bandIdx < minIdx) band = ltvVacancyMinBand;
  }
  if (dscrMinBand) {
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const minIdx = order.indexOf(dscrMinBand);
    if (bandIdx < minIdx) band = dscrMinBand;
  }

  // Breakdown: structural/market as % of effective contribution; structural floor 10% when any risks
  const effectiveTotal = structuralTotal + marketCapped;
  let structuralWeightPct =
    effectiveTotal > 0 ? (structuralTotal / effectiveTotal) * 100 : 0;
  let marketWeightPct =
    effectiveTotal > 0 ? (marketCapped / effectiveTotal) * 100 : 0;
  if (count > 0 && structuralWeightPct < 10) {
    structuralWeightPct = 10;
    marketWeightPct = 100 - structuralWeightPct;
  }

  const driverLabel = (riskType: string): string => {
    switch (riskType) {
      case "DebtCostRisk":
      case "RefiRisk":
        return "leverage";
      case "VacancyUnderstated":
        return "vacancy";
      case "ExitCapCompression":
        return "compression";
      case "DataMissing":
      case "ExpenseUnderstated":
        return "missing";
      default:
        return "market";
    }
  };
  const driverMap = new Map<string, number>();
  for (const r of risks) {
    const pts = computeRiskPenaltyContribution(r, assumptions);
    if (pts <= 0) continue;
    const label = driverLabel(r.risk_type);
    driverMap.set(label, (driverMap.get(label) ?? 0) + pts);
  }
  driverMap.set("compression", (driverMap.get("compression") ?? 0) + compressionPenalty);
  driverMap.set("leverage", (driverMap.get("leverage") ?? 0) + ltvVacancyPenalty + dscrPenalty);
  driverMap.set("market", (driverMap.get("market") ?? 0) + macroPenalty);
  driverMap.set("stabilizers", -stabilizerBenefit);

  const contributions = Array.from(driverMap.entries())
    .filter(([, pts]) => pts !== 0)
    .map(([driver, points]) => ({ driver, points }));
  const totalContrib = contributions.reduce((s, c) => s + Math.abs(c.points), 0);
  const contribution_pct =
    totalContrib > 0
      ? contributions.map(({ driver, points }) => ({
          driver,
          pct: Math.round((Math.abs(points) / totalContrib) * 100),
        }))
      : [];
  const top_drivers = [...contributions]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((c) => c.driver);

  return {
    score,
    band,
    breakdown: {
      structural_weight: Math.min(100, Math.round(structuralWeightPct)),
      market_weight: Math.min(100, Math.round(marketWeightPct)),
      confidence_factor: Math.round((totalConfidence / count) * 100) / 100,
      stabilizer_benefit: stabilizerBenefit,
      penalty_total: Math.round(effectivePenaltyForScore + compressionPenalty + ltvVacancyPenalty + dscrPenalty),
      contributions,
      contribution_pct,
      top_drivers,
      review_flag,
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

/**
 * Per-risk penalty contribution (for explainability). Uses same logic as computePenalties.
 * Does not recompute total score; use stored severity_current and confidence only.
 */
export function computeRiskPenaltyContribution(
  risk: { risk_type: string; severity_current: string; confidence: string | null },
  assumptions: DealScanAssumptions | undefined
): number {
  const conf = CONFIDENCE_FACTOR[risk.confidence ?? ""] ?? 0.4;
  const sevPoints = SEVERITY_POINTS[risk.severity_current] ?? 2;
  const ltv = getAssumptionValue(assumptions, "ltv");
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  const hasExpenseGrowth = getAssumptionValue(assumptions, "expense_growth") != null;
  const hasDebtRate = getAssumptionValue(assumptions, "debt_rate") != null;

  switch (risk.risk_type) {
    case "DataMissing":
      return Math.min(sevPoints * conf, 3);
    case "ExpenseUnderstated":
      return !hasExpenseGrowth ? Math.min(sevPoints * conf, 3) : 0;
    case "DebtCostRisk":
      if (hasDebtRate === false && ltv != null && ltv > 65) return Math.min(4 * conf, 4);
      return Math.min(sevPoints * conf, 6);
    case "ExitCapCompression":
      if (exitCap != null && capRateIn != null && capRateIn - exitCap > 0.5) {
        return Math.min(sevPoints * conf, 8);
      }
      return 0;
    case "RentGrowthAggressive":
    case "RefiRisk":
    case "MarketLiquidityRisk":
    case "InsuranceRisk":
    case "ConstructionTimingRisk":
    case "RegulatoryPolicyExposure":
    case "VacancyUnderstated":
    default:
      return Math.min(sevPoints * conf, 6);
  }
}

/**
 * Describe which stabilizers applied from assumptions (for explainability).
 */
export function describeStabilizers(assumptions: DealScanAssumptions | undefined): string[] {
  const out: string[] = [];
  const ltv = getAssumptionValue(assumptions, "ltv");
  if (ltv != null) {
    if (ltv <= 60) out.push("Low LTV (≤60)");
    else if (ltv <= 65) out.push("Moderate LTV (≤65)");
  }
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const capRateIn = getAssumptionValue(assumptions, "cap_rate_in");
  if (exitCap != null && capRateIn != null && exitCap >= capRateIn) {
    out.push("Exit cap ≥ cap rate in");
  }
  return out;
}
