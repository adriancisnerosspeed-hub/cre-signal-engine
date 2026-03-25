/**
 * Deterministic Risk Injection Layer.
 * Injects risks that numeric assumptions mathematically warrant but the AI
 * may have non-deterministically omitted. Runs AFTER percent normalization
 * and BEFORE severity overrides + scoring.
 *
 * Pure function — no DB, no randomness, no side effects.
 */

import type {
  DealScanAssumptions,
  DealScanRisk,
  RiskType,
  Severity,
} from "./dealScanContract";

export type RiskInjectionResult = {
  risks: DealScanRisk[];
  injectedTypes: Set<RiskType>;
};

/* ---------- helpers ---------- */

function getVal(
  assumptions: DealScanAssumptions,
  key: keyof DealScanAssumptions
): number | null {
  const cell = assumptions[key];
  if (!cell || typeof cell !== "object") return null;
  const v = cell.value;
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

const CONSTRUCTION_KEYWORDS = [
  "renovation",
  "renovating",
  "renovated",
  "construction",
  "offline units",
  "offline unit",
  "redevelopment",
  "redeveloping",
  "repositioning",
  "capital improvement",
  "rehab",
];

export function hasConstructionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSTRUCTION_KEYWORDS.some((kw) => lower.includes(kw));
}

/* ---------- injection rule type ---------- */

type InjectionRule = {
  riskType: RiskType;
  shouldInject: (a: DealScanAssumptions, text: string) => boolean;
  buildRisk: (a: DealScanAssumptions, text: string) => DealScanRisk;
};

/* ---------- rules ---------- */

const INJECTION_RULES: InjectionRule[] = [
  // 1. DebtCostRisk — debt_rate >= 6.0%
  {
    riskType: "DebtCostRisk",
    shouldInject: (a) => {
      const dr = getVal(a, "debt_rate");
      return dr != null && dr >= 6.0;
    },
    buildRisk: (a) => {
      const dr = getVal(a, "debt_rate")!;
      const severity: Severity = dr >= 7.0 ? "High" : "Medium";
      return {
        risk_type: "DebtCostRisk",
        severity,
        what_changed_or_trigger: `Debt rate of ${dr}% increases interest expense risk`,
        why_it_matters: "Elevated borrowing costs reduce debt service coverage and compress levered returns",
        who_this_affects: "Equity investors, lenders",
        recommended_action: "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },

  // 2. RefiRisk — debt_rate >= 6.5% AND hold_period_years >= 5
  {
    riskType: "RefiRisk",
    shouldInject: (a) => {
      const dr = getVal(a, "debt_rate");
      const hold = getVal(a, "hold_period_years");
      return dr != null && dr >= 6.5 && hold != null && hold >= 5;
    },
    buildRisk: (a) => {
      const dr = getVal(a, "debt_rate")!;
      const hold = getVal(a, "hold_period_years")!;
      return {
        risk_type: "RefiRisk",
        severity: "Medium",
        what_changed_or_trigger: `Refinancing risk over ${hold}-year hold at ${dr}% current rate`,
        why_it_matters: "Long hold with elevated rates increases refinancing exposure at maturity",
        who_this_affects: "Equity investors, lenders",
        recommended_action: "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },

  // 3. VacancyUnderstated — vacancy >= 5% AND construction keywords
  {
    riskType: "VacancyUnderstated",
    shouldInject: (a, text) => {
      const vac = getVal(a, "vacancy");
      return vac != null && vac >= 5 && hasConstructionKeyword(text);
    },
    buildRisk: (a) => {
      const vac = getVal(a, "vacancy")!;
      return {
        risk_type: "VacancyUnderstated",
        severity: "Low",
        what_changed_or_trigger: `Stated vacancy of ${vac}% may understate effective vacancy during renovation`,
        why_it_matters: "Active renovation reduces leasable area; effective vacancy likely higher than stated",
        who_this_affects: "Equity investors, property manager",
        recommended_action: "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },

  // 4. ExitCapCompression — exit_cap - cap_rate_in <= 0.5
  {
    riskType: "ExitCapCompression",
    shouldInject: (a) => {
      const exitCap = getVal(a, "exit_cap");
      const capIn = getVal(a, "cap_rate_in");
      if (exitCap == null || capIn == null) return false;
      return exitCap - capIn <= 0.5;
    },
    buildRisk: (a) => {
      const exitCap = getVal(a, "exit_cap")!;
      const capIn = getVal(a, "cap_rate_in")!;
      const spreadBps = Math.round((exitCap - capIn) * 100);
      const severity: Severity = exitCap > capIn ? "Low" : "Medium";
      return {
        risk_type: "ExitCapCompression",
        severity,
        what_changed_or_trigger: `Exit cap ${exitCap}% vs entry cap ${capIn}% \u2014 ${spreadBps}bps spread`,
        why_it_matters: "Tight or negative exit cap spread assumes stable or compressing cap rates at disposition",
        who_this_affects: "Equity investors",
        recommended_action: exitCap <= capIn ? "Act" : "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },

  // 5. ConstructionTimingRisk — construction keywords in deal text
  {
    riskType: "ConstructionTimingRisk",
    shouldInject: (_a, text) => hasConstructionKeyword(text),
    buildRisk: () => ({
      risk_type: "ConstructionTimingRisk",
      severity: "Medium",
      what_changed_or_trigger: "Active construction/renovation creates timing and cost overrun risk",
      why_it_matters: "Construction delays and cost overruns can erode returns and extend stabilization timelines",
      who_this_affects: "Equity investors, lenders, construction oversight",
      recommended_action: "Monitor",
      confidence: "High",
      evidence_snippets: [],
    }),
  },

  // 6. RentGrowthAggressive — rent_growth >= 3.0%
  {
    riskType: "RentGrowthAggressive",
    shouldInject: (a) => {
      const rg = getVal(a, "rent_growth");
      return rg != null && rg >= 3.0;
    },
    buildRisk: (a) => {
      const rg = getVal(a, "rent_growth")!;
      const severity: Severity = rg >= 4.0 ? "Medium" : "Low";
      return {
        risk_type: "RentGrowthAggressive",
        severity,
        what_changed_or_trigger: `Projected rent growth of ${rg}% requires sustained market strength`,
        why_it_matters: "Above-trend rent growth assumptions are vulnerable to market softening or competitive supply",
        who_this_affects: "Equity investors",
        recommended_action: "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },

  // 7. ExpenseUnderstated — expense_growth stated but < 3.0%
  {
    riskType: "ExpenseUnderstated",
    shouldInject: (a) => {
      const eg = getVal(a, "expense_growth");
      return eg != null && eg < 3.0;
    },
    buildRisk: (a) => {
      const eg = getVal(a, "expense_growth")!;
      return {
        risk_type: "ExpenseUnderstated",
        severity: "Low",
        what_changed_or_trigger: `Expense growth of ${eg}% is below historical norms`,
        why_it_matters: "Below-trend expense growth may understate operating cost pressure over the hold period",
        who_this_affects: "Equity investors, asset manager",
        recommended_action: "Monitor",
        confidence: "High",
        evidence_snippets: [],
      };
    },
  },
];

/* ---------- main function ---------- */

/**
 * Inject deterministic risks that the numbers mathematically warrant.
 * Does NOT replace risks already extracted by the AI.
 */
export function injectDeterministicRisks(
  assumptions: DealScanAssumptions,
  aiRisks: DealScanRisk[],
  dealText: string
): RiskInjectionResult {
  const existingTypes = new Set<string>(aiRisks.map((r) => r.risk_type));
  const injectedTypes = new Set<RiskType>();
  const result = [...aiRisks];

  for (const rule of INJECTION_RULES) {
    if (existingTypes.has(rule.riskType)) continue;
    if (!rule.shouldInject(assumptions, dealText)) continue;
    result.push(rule.buildRisk(assumptions, dealText));
    injectedTypes.add(rule.riskType);
  }

  return { risks: result, injectedTypes };
}
