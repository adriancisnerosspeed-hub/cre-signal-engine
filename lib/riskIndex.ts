/**
 * CRE Signal Risk Index™ — v2.0 institutional-grade scoring.
 * Final Score = Base + Risk Penalties - Stabilizers.
 * Bands: 0–34 Low, 35–54 Moderate, 55–69 Elevated, 70+ High.
 *
 * Robustness: deterministic (same inputs → same score), uses only normalized
 * structured inputs (severity weights + macro adjustment + missing-data penalty).
 * Satisfies boundedness (0–100), stability (no randomness), and explainability
 * via breakdown (structural_weight, market_weight, contributions, top_drivers, etc.).
 *
 * Optional future refactor: split into lib/riskIndex/ (constants, penalties, bands, index)
 * if file size or complexity grows further.
 */

import type { DealScanAssumptions } from "./dealScanContract";
import { validateAndSanitizeForRiskIndex } from "./assumptionValidation";

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
  /** True when overall confidence is low (e.g. < 0.70) or validation/edge flags. */
  review_flag?: boolean;
  /** Reason codes when tier floor overrides applied (e.g. FORCED_ELEVATED_DSCR). */
  tier_drivers?: string[];
  /** Input validation messages from validateAndSanitizeForRiskIndex. */
  validation_errors?: string[];
  /** Edge-case flags (e.g. EDGE_EXIT_CAP_EXTREME). */
  edge_flags?: string[];
  /** Set by API when deal is in top 20% by purchase_price or above threshold. */
  exposure_bucket?: "High" | "Normal";
  /** Set by API when Elevated/High band and High exposure (e.g. HIGH_IMPACT_RISK). */
  alert_tags?: string[];
  /** Set by API when returning scan: true if scan completed_at > 30 days ago. */
  stale_scan?: boolean;
  /** When previous_score provided: prior scan score. */
  previous_score?: number;
  /** When previous_score provided: current minus previous. */
  delta_score?: number;
  /** When previous_score provided: band transition (e.g. "Moderate → Elevated"). */
  delta_band?: string;
  /** When previous_score provided: true if delta_score ≥ 8. */
  deterioration_flag?: boolean;
  /** When previous_score provided: true iff previous scan used same risk_index_version (delta is comparable). */
  delta_comparable?: boolean;
  /** Per-driver confidence multiplier (e.g. 1.0 High, 0.7 Medium) for visibility. */
  driver_confidence_multipliers?: { driver: string; multiplier: number }[];
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

/** Ramp penalty for exit cap compression: linear from 0.5% to 1.5% (0–6 points). Tier override at ≥1.0% remains. */
function rampCompressionPenalty(compressionPct: number): number {
  if (compressionPct < 0.5) return 0;
  if (compressionPct >= 1.5) return 6;
  return 3 + ((compressionPct - 0.5) / 1) * 3;
}

/**
 * Exit cap compression: when exit_cap < cap_rate_in, compression = cap_rate_in - exit_cap (% points).
 * Ramped penalty 0.5%–1.5%; tier override to minimum Elevated when >= 1.0%.
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
  const penalty = rampCompressionPenalty(compression);
  return { compression, penalty };
}

/** Ramp DSCR penalty: linear from 1.25 (0) to 1.00 (6). Tier override at <1.10 remains. */
function rampDscrPenalty(dscr: number): number {
  if (dscr >= 1.25) return 0;
  if (dscr <= 1) return 6;
  return ((1.25 - dscr) / 0.25) * 6;
}

/**
 * LTV + vacancy: scale penalty by distance into risk zone; tier overrides unchanged.
 */
function rampLtvVacancyPenalty(ltv: number, vacancy: number): { penalty: number; forceMinBand: RiskIndexBand | null } {
  if (ltv >= 85 && vacancy >= 35) return { penalty: 8, forceMinBand: "High" };
  if (ltv >= 80 && vacancy >= 30) return { penalty: 5, forceMinBand: "Elevated" };
  if (ltv >= 75 && vacancy >= 20) {
    const dist = Math.min(1, ((ltv - 75) / 10 + (vacancy - 20) / 15) / 2);
    return { penalty: 2 + Math.round(dist * 2), forceMinBand: null };
  }
  return { penalty: 0, forceMinBand: null };
}

/**
 * LTV + vacancy interaction: ramped penalty; tier overrides at higher thresholds.
 */
function getLtvVacancyInteraction(
  assumptions: DealScanAssumptions | undefined
): { penalty: number; forceMinBand: RiskIndexBand | null } {
  const ltv = getAssumptionValue(assumptions, "ltv");
  const vacancy = getAssumptionValue(assumptions, "vacancy");
  if (ltv == null || vacancy == null) return { penalty: 0, forceMinBand: null };
  return rampLtvVacancyPenalty(ltv, vacancy);
}

/**
 * DSCR: ramped penalty 1.25→1.00; if DSCR < 1.10 force Elevated.
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
  const penalty = rampDscrPenalty(dscr);
  const forceMinBand: RiskIndexBand | null = dscr < 1.1 ? "Elevated" : null;
  return { penalty, forceMinBand };
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

/** Max share of total contribution any single driver may have (institutional cap). */
export const MAX_DRIVER_SHARE_PCT = 40;

export type ComputeRiskIndexParams = {
  risks: RiskRow[];
  assumptions?: DealScanAssumptions;
  /** Number of risks that have a linked macro signal (overlay). Capped in scoring. Used when macroDecayedWeight not provided. */
  macroLinkedCount?: number;
  /** When provided, use decayed macro weight instead of macroLinkedCount (e.g. from computeDecayedMacroWeight). */
  macroDecayedWeight?: number;
  /** When provided, breakdown includes previous_score, delta_score, delta_band, deterioration_flag, delta_comparable. */
  previous_score?: number;
  /** When provided with previous_score: if !== RISK_INDEX_VERSION, delta not comparable (omit delta_*). */
  previous_risk_index_version?: string | null;
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
  const rawAssumptions =
    Array.isArray(params) ? undefined : (params as ComputeRiskIndexParams).assumptions;
  const macroLinkedCount = Array.isArray(params)
    ? 0
    : (params as ComputeRiskIndexParams).macroLinkedCount ?? 0;
  const macroDecayedWeight = Array.isArray(params)
    ? undefined
    : (params as ComputeRiskIndexParams).macroDecayedWeight;
  const previous_score = Array.isArray(params) ? undefined : (params as ComputeRiskIndexParams).previous_score;
  const previous_risk_index_version = Array.isArray(params) ? undefined : (params as ComputeRiskIndexParams).previous_risk_index_version;

  const { sanitizedAssumptions, validation_errors, severe: validationSevere } =
    validateAndSanitizeForRiskIndex(rawAssumptions);
  const assumptions = sanitizedAssumptions;

  const tier_drivers: string[] = [];
  const edge_flags: string[] = [];

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

  let macroPenalty = macroDecayedWeight != null ? macroDecayedWeight : macroLinkedCount * 1;
  const totalRaw = structuralTotal + marketTotal;
  const marketCapped =
    totalRaw > 0 ? Math.min(marketTotal, 0.35 * totalRaw) : marketTotal;
  const effectivePenalty = structuralTotal + marketCapped;
  const macroCap = Math.min(MACRO_PENALTY_CAP, 0.35 * Math.max(effectivePenalty, 1));
  macroPenalty = Math.min(macroPenalty, macroCap);

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
    tier_drivers.push("MISSING_DATA_CAP_APPLIED");
  }

  const totalConfidence = risks.reduce(
    (s, r) => s + (CONFIDENCE_FACTOR[r.confidence ?? ""] ?? 0.4),
    0
  );
  const count = risks.length || 1;
  const overallConfidence = count > 0 ? totalConfidence / count : 0.5;
  let review_flag = validation_errors.length > 0;
  if (overallConfidence < 0.7) {
    review_flag = true;
    rawScore += 3;
  } else if (overallConfidence >= 0.9) {
    rawScore -= 1;
  }
  if (validation_errors.length > 0) {
    rawScore += 3;
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

  const ltv = getAssumptionValue(assumptions, "ltv");
  const vacancy = getAssumptionValue(assumptions, "vacancy");
  const exitCap = getAssumptionValue(assumptions, "exit_cap");
  const rentGrowth = getAssumptionValue(assumptions, "rent_growth");

  if (exitCap != null && (exitCap < 2 || exitCap > 15)) {
    edge_flags.push("EDGE_EXIT_CAP_EXTREME");
    review_flag = true;
  }
  if (rentGrowth != null && rentGrowth > 8 && overallConfidence < 0.9) {
    edge_flags.push("EDGE_PRO_FORMA_AGGRESSIVE");
    review_flag = true;
  }
  if (vacancy != null && vacancy > 40) {
    edge_flags.push("EDGE_VACANCY_EXTREME");
    rawScore += 2;
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  let band = scoreToBand(score);

  if (ltv != null && ltv > 90) {
    tier_drivers.push("FORCED_HIGH_LTV_90");
    band = "High";
  }
  if (exitCompression >= 1.0) {
    tier_drivers.push("FORCED_ELEVATED_EXIT_CAP_COMPRESSION");
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const elevatedIdx = order.indexOf("Elevated");
    if (bandIdx < elevatedIdx) band = "Elevated";
  }
  if (ltvVacancyMinBand) {
    tier_drivers.push(ltvVacancyMinBand === "High" ? "FORCED_HIGH_LTV_VACANCY" : "FORCED_ELEVATED_LTV_VACANCY");
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const minIdx = order.indexOf(ltvVacancyMinBand);
    if (bandIdx < minIdx) band = ltvVacancyMinBand;
  }
  if (dscrMinBand) {
    tier_drivers.push("FORCED_ELEVATED_DSCR");
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const minIdx = order.indexOf(dscrMinBand);
    if (bandIdx < minIdx) band = dscrMinBand;
  }
  if (validationSevere) {
    tier_drivers.push("FORCED_MODERATE_SEVERE_VALIDATION");
    const order: RiskIndexBand[] = ["Low", "Moderate", "Elevated", "High"];
    const bandIdx = order.indexOf(band);
    const modIdx = order.indexOf("Moderate");
    if (bandIdx < modIdx) band = "Moderate";
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
  const driverConfidenceSum = new Map<string, number>();
  const driverConfidenceCount = new Map<string, number>();
  const confFactor = (c: string | null) => CONFIDENCE_FACTOR[c ?? ""] ?? 0.4;
  for (const r of risks) {
    const pts = computeRiskPenaltyContribution(r, assumptions);
    if (pts <= 0) continue;
    const label = driverLabel(r.risk_type);
    driverMap.set(label, (driverMap.get(label) ?? 0) + pts);
    const cf = confFactor(r.confidence);
    driverConfidenceSum.set(label, (driverConfidenceSum.get(label) ?? 0) + cf);
    driverConfidenceCount.set(label, (driverConfidenceCount.get(label) ?? 0) + 1);
  }
  driverMap.set("compression", (driverMap.get("compression") ?? 0) + compressionPenalty);
  driverMap.set("leverage", (driverMap.get("leverage") ?? 0) + ltvVacancyPenalty + dscrPenalty);
  driverMap.set("market", (driverMap.get("market") ?? 0) + macroPenalty);
  driverMap.set("stabilizers", -stabilizerBenefit);
  driverConfidenceSum.set("compression", 1);
  driverConfidenceCount.set("compression", 1);
  driverConfidenceSum.set("leverage", 1);
  driverConfidenceCount.set("leverage", 1);
  driverConfidenceSum.set("market", 1);
  driverConfidenceCount.set("market", 1);
  driverConfidenceSum.set("stabilizers", 1);
  driverConfidenceCount.set("stabilizers", 1);

  // Driver share cap: no single positive driver exceeds 40% of total positive (excluding stabilizers)
  const totalPositive = Array.from(driverMap.entries())
    .filter(([d]) => d !== "stabilizers")
    .reduce((s, [, pts]) => s + Math.max(0, pts), 0);
  let driverShareCapApplied = false;
  if (totalPositive > 0) {
    let residual = 0;
    for (const [driver, points] of driverMap.entries()) {
      if (driver === "stabilizers" || points <= 0) continue;
      if (points > MAX_DRIVER_SHARE_PCT / 100 * totalPositive) {
        const cap = (MAX_DRIVER_SHARE_PCT / 100) * totalPositive;
        driverMap.set(driver, cap);
        residual += points - cap;
        driverShareCapApplied = true;
      }
    }
    if (residual > 0) {
      driverMap.set("residual", (driverMap.get("residual") ?? 0) + residual);
      driverConfidenceSum.set("residual", 1);
      driverConfidenceCount.set("residual", 1);
    }
  }
  if (driverShareCapApplied) edge_flags.push("EDGE_DRIVER_SHARE_CAP_APPLIED");

  let contributions = Array.from(driverMap.entries())
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

  const driver_confidence_multipliers = contributions.map(({ driver }) => {
    const sum = driverConfidenceSum.get(driver) ?? 0;
    const n = driverConfidenceCount.get(driver) ?? 1;
    return { driver, multiplier: Math.round((sum / n) * 100) / 100 };
  });

  const comparable = previous_score != null && (previous_risk_index_version == null || previous_risk_index_version === RISK_INDEX_VERSION);
  const delta_score = comparable ? score - previous_score : undefined;
  const previous_band = previous_score != null ? scoreToBand(previous_score) : undefined;
  const delta_band = comparable && previous_band != null ? `${previous_band} → ${band}` : undefined;
  const deterioration_flag = delta_score != null && delta_score >= 8;

  const deltaBreakdown =
    previous_score != null
      ? comparable
        ? { previous_score, delta_score, delta_band, deterioration_flag, delta_comparable: true as const }
        : { previous_score, delta_comparable: false as const }
      : {};

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
      ...(tier_drivers.length > 0 && { tier_drivers }),
      ...(validation_errors.length > 0 && { validation_errors }),
      ...(edge_flags.length > 0 && { edge_flags }),
      ...deltaBreakdown,
      driver_confidence_multipliers,
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
