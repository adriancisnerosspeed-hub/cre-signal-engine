/**
 * Rule-based recommended actions for IC Summary. No AI.
 * Maps risk severity + linked signal types to institutional action text.
 */

type RiskWithSignals = {
  severity_current: string;
  risk_type: string;
  signal_types: string[];
};

function hasSignalType(types: string[], keywords: string[]): boolean {
  const lower = types.map((t) => (t ?? "").toLowerCase()).join(" ");
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function getRecommendedActions(risksWithSignals: RiskWithSignals[]): string[] {
  const actions = new Set<string>();

  for (const r of risksWithSignals) {
    const sev = r.severity_current;
    const high = sev === "High";
    const mediumOrHigh = sev === "High" || sev === "Medium";

    if (high && hasSignalType(r.signal_types, ["supply", "demand", "rent", "vacancy"])) {
      actions.add("Stress test rent growth to 2%.");
    }
    if (mediumOrHigh && hasSignalType(r.signal_types, ["cap", "exit", "pricing"])) {
      actions.add("Sensitivity analysis on exit cap expansion (e.g. +75 bps).");
    }
    if (high && (r.risk_type === "RefiRisk" || r.risk_type === "DebtCostRisk")) {
      actions.add("Model refinancing at higher debt cost and extended maturity.");
    }
    if (mediumOrHigh && hasSignalType(r.signal_types, ["credit", "liquidity", "lender"])) {
      actions.add("Confirm debt terms and lender capacity under stress.");
    }
    if (high && (r.risk_type === "ExpenseUnderstated" || r.risk_type === "InsuranceRisk")) {
      actions.add("Reconcile expense and insurance assumptions with current market.");
    }
    if (mediumOrHigh && r.risk_type === "VacancyUnderstated") {
      actions.add("Stress vacancy assumption against market comps.");
    }
  }

  return [...actions];
}
