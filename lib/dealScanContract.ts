/**
 * Deal Risk Scan: strict output contract, normalization, and parsing.
 * No markdown; JSON only. Repair once then fail safely.
 */

export const ASSUMPTION_KEYS = [
  "purchase_price",
  "cap_rate_in",
  "noi_year1",
  "rent_growth",
  "expense_growth",
  "vacancy",
  "exit_cap",
  "hold_period_years",
  "debt_rate",
  "ltv",
] as const;

export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];

export const CONFIDENCE_VALUES = ["Low", "Medium", "High"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export const SEVERITY_VALUES = ["Low", "Medium", "High"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

export const RECOMMENDED_ACTION_VALUES = ["Act", "Monitor"] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTION_VALUES)[number];

export const RISK_TYPES = [
  "ExitCapCompression",
  "RentGrowthAggressive",
  "ExpenseUnderstated",
  "VacancyUnderstated",
  "RefiRisk",
  "DebtCostRisk",
  "InsuranceRisk",
  "ConstructionTimingRisk",
  "MarketLiquidityRisk",
  "RegulatoryPolicyExposure",
  "DataMissing",
] as const;

export type RiskType = (typeof RISK_TYPES)[number];

export type AssumptionCell = {
  value: number | null;
  unit: string | null;
  confidence: Confidence;
};

export type DealScanAssumptions = Partial<Record<AssumptionKey, AssumptionCell>>;

export type DealScanRisk = {
  risk_type: RiskType;
  severity: Severity;
  what_changed_or_trigger: string;
  why_it_matters: string;
  who_this_affects: string;
  recommended_action: RecommendedAction;
  confidence: Confidence;
  evidence_snippets: string[];
};

export type DealScanRaw = {
  assumptions?: Record<string, unknown>;
  risks?: unknown[];
};

export type DealScanNormalized = {
  assumptions: DealScanAssumptions;
  risks: DealScanRisk[];
};

const DEFAULT_CONFIDENCE: Confidence = "Low";
const DEFAULT_SEVERITY: Severity = "Low";
const DEFAULT_ACTION: RecommendedAction = "Monitor";

function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").replace(/%/g, "").trim();
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function normalizeConfidence(v: unknown): Confidence {
  if (typeof v !== "string") return DEFAULT_CONFIDENCE;
  const s = v.trim();
  if (CONFIDENCE_VALUES.includes(s as Confidence)) return s as Confidence;
  const lower = s.toLowerCase();
  if (lower === "low") return "Low";
  if (lower === "medium") return "Medium";
  if (lower === "high") return "High";
  return DEFAULT_CONFIDENCE;
}

function normalizeSeverity(v: unknown): Severity {
  if (typeof v !== "string") return DEFAULT_SEVERITY;
  const s = v.trim();
  if (SEVERITY_VALUES.includes(s as Severity)) return s as Severity;
  const lower = s.toLowerCase();
  if (lower === "low") return "Low";
  if (lower === "medium") return "Medium";
  if (lower === "high") return "High";
  return DEFAULT_SEVERITY;
}

function normalizeRecommendedAction(v: unknown): RecommendedAction {
  if (typeof v !== "string") return DEFAULT_ACTION;
  const s = v.trim();
  if (RECOMMENDED_ACTION_VALUES.includes(s as RecommendedAction)) return s as RecommendedAction;
  if (/act/i.test(s)) return "Act";
  return "Monitor";
}

function normalizeRiskType(v: unknown): RiskType {
  if (typeof v !== "string") return "DataMissing";
  const s = v.trim();
  if (RISK_TYPES.includes(s as RiskType)) return s as RiskType;
  const lower = s.toLowerCase();
  if (lower.includes("exit") && lower.includes("cap")) return "ExitCapCompression";
  if (lower.includes("rent") && lower.includes("growth")) return "RentGrowthAggressive";
  if (lower.includes("expense")) return "ExpenseUnderstated";
  if (lower.includes("vacancy")) return "VacancyUnderstated";
  if (lower.includes("refi")) return "RefiRisk";
  if (lower.includes("debt")) return "DebtCostRisk";
  if (lower.includes("insurance")) return "InsuranceRisk";
  if (lower.includes("construction")) return "ConstructionTimingRisk";
  if (lower.includes("liquidity")) return "MarketLiquidityRisk";
  if (lower.includes("regulatory") || lower.includes("policy")) return "RegulatoryPolicyExposure";
  return "DataMissing";
}

function normalizeAssumptionCell(raw: unknown): AssumptionCell {
  if (!raw || typeof raw !== "object") {
    return { value: null, unit: null, confidence: DEFAULT_CONFIDENCE };
  }
  const o = raw as Record<string, unknown>;
  return {
    value: parseNumber(o.value),
    unit: typeof o.unit === "string" ? o.unit.trim() || null : null,
    confidence: normalizeConfidence(o.confidence),
  };
}

function normalizeAssumptions(raw: Record<string, unknown> | undefined): DealScanAssumptions {
  const out: DealScanAssumptions = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of ASSUMPTION_KEYS) {
    if (key in raw) {
      out[key] = normalizeAssumptionCell((raw as Record<string, unknown>)[key]);
    }
  }
  return out;
}

function normalizeTrigger(s: unknown): string {
  if (typeof s === "string") return s.trim().slice(0, 2000);
  return "";
}

function riskDedupeKey(r: DealScanRisk): string {
  return `${r.risk_type}:${normalizeTrigger(r.what_changed_or_trigger).toLowerCase().slice(0, 200)}`;
}

function normalizeRisks(raw: unknown[] | undefined): DealScanRisk[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: DealScanRisk[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const risk: DealScanRisk = {
      risk_type: normalizeRiskType(o.risk_type),
      severity: normalizeSeverity(o.severity),
      what_changed_or_trigger: normalizeTrigger(o.what_changed_or_trigger),
      why_it_matters: normalizeTrigger(o.why_it_matters),
      who_this_affects: normalizeTrigger(o.who_this_affects),
      recommended_action: normalizeRecommendedAction(o.recommended_action),
      confidence: normalizeConfidence(o.confidence),
      evidence_snippets: Array.isArray(o.evidence_snippets)
        ? o.evidence_snippets.filter((x): x is string => typeof x === "string").slice(0, 10)
        : [],
    };
    const key = riskDedupeKey(risk);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(risk);
  }

  return result;
}

/**
 * Repair raw LLM output: strip markdown code fences and trim.
 * Call once before parse; if parse still fails, fail safely.
 */
export function repairDealScanJson(raw: string): string {
  let s = raw.trim();
  const mStart = s.match(/^```(?:json)?\s*/i);
  if (mStart) s = s.slice(mStart[0].length).trim();
  const mEnd = s.match(/\s*```\s*$/i);
  if (mEnd) s = s.slice(0, s.length - mEnd[0].length).trim();
  return s.trim();
}

/**
 * Parse raw string to DealScanRaw. Returns null if invalid.
 */
export function parseDealScanOutput(raw: string): DealScanRaw | null {
  const repaired = repairDealScanJson(raw);
  try {
    const parsed = JSON.parse(repaired) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    return {
      assumptions: o.assumptions && typeof o.assumptions === "object" ? (o.assumptions as Record<string, unknown>) : undefined,
      risks: Array.isArray(o.risks) ? o.risks : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize parsed output to strict contract: enums, numbers, dedupe risks.
 */
export function normalizeDealScanOutput(parsed: DealScanRaw): DealScanNormalized {
  return {
    assumptions: normalizeAssumptions(parsed.assumptions),
    risks: normalizeRisks(parsed.risks),
  };
}

/**
 * Full pipeline: repair, parse, normalize. Returns null if parse fails after repair.
 */
export function parseAndNormalizeDealScan(raw: string): DealScanNormalized | null {
  const parsed = parseDealScanOutput(raw);
  if (!parsed) return null;
  return normalizeDealScanOutput(parsed);
}
