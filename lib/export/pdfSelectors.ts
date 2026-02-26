/**
 * Deterministic selectors for one-page IC PDF: top assumptions, top risks, deduped macro signals.
 */

import type { DealScanAssumptions } from "@/lib/dealScanContract";

const CONFIDENCE_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const SEVERITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/** Whitelist order for assumption keys (by decision value). */
const ASSUMPTION_KEY_ORDER = [
  "ltv",
  "vacancy",
  "cap_rate_in",
  "exit_cap",
  "debt_rate",
  "rent_growth",
  "hold_period_years",
  "noi_year1",
  "expense_growth",
  "purchase_price",
] as const;

export type AssumptionRow = {
  key: string;
  value: number | null;
  unit: string | null;
  confidence: string;
};

/**
 * Select top N assumptions by confidence (desc) then key whitelist order.
 */
export function selectTopAssumptions(
  assumptions: DealScanAssumptions | undefined | null,
  limit: number = 6
): AssumptionRow[] {
  if (!assumptions || typeof assumptions !== "object") return [];

  const entries = Object.entries(assumptions)
    .filter(([, cell]) => cell != null && typeof cell === "object")
    .map(([key, cell]) => {
      const c = cell as { value?: number | null; unit?: string | null; confidence?: string };
      return {
        key,
        value: c.value != null && typeof c.value === "number" ? c.value : null,
        unit: typeof c.unit === "string" ? c.unit : null,
        confidence: typeof c.confidence === "string" ? c.confidence : "Low",
      };
    })
    .sort((a, b) => {
      const confA = CONFIDENCE_ORDER[a.confidence] ?? 0;
      const confB = CONFIDENCE_ORDER[b.confidence] ?? 0;
      if (confB !== confA) return confB - confA;
      const idxA = ASSUMPTION_KEY_ORDER.indexOf(a.key as (typeof ASSUMPTION_KEY_ORDER)[number]);
      const idxB = ASSUMPTION_KEY_ORDER.indexOf(b.key as (typeof ASSUMPTION_KEY_ORDER)[number]);
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;
      return orderA - orderB;
    });

  return entries.slice(0, limit);
}

export type RiskRow = {
  risk_type: string;
  severity_current: string;
  confidence: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
};

/**
 * Select top N risks by severity (desc) then confidence (desc).
 */
export function selectTopRisks(
  risks: RiskRow[],
  limit: number = 3
): RiskRow[] {
  const sorted = [...risks].sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity_current] ?? 0;
    const sevB = SEVERITY_ORDER[b.severity_current] ?? 0;
    if (sevB !== sevA) return sevB - sevA;
    const confA = CONFIDENCE_ORDER[a.confidence ?? ""] ?? 0;
    const confB = CONFIDENCE_ORDER[b.confidence ?? ""] ?? 0;
    return confB - confA;
  });
  return sorted.slice(0, limit);
}

export type MacroSignalRow = {
  signal_id: string;
  display_text: string;
};

/**
 * Dedupe macro signals by signal_id. Returns unique signals, first occurrence wins.
 */
export function dedupeSignals(
  links: {
    signal_id: string;
    link_reason: string | null;
    signal_type?: string | null;
    what_changed?: string | null;
  }[],
  max: number = 5
): MacroSignalRow[] {
  const byId = new Map<string, string>();
  for (const link of links) {
    if (byId.has(link.signal_id)) continue;
    const body = link.what_changed ?? link.link_reason ?? "";
    const text = [link.signal_type, body].filter(Boolean).join(" — ") || "Signal";
    byId.set(link.signal_id, text.slice(0, 120));
  }
  return Array.from(byId.entries()).slice(0, max).map(([signal_id, display_text]) => ({
    signal_id,
    display_text,
  }));
}

/**
 * One sentence: take first sentence or first ~100 chars.
 */
export function oneSentence(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  const trimmed = text.trim();
  const dot = trimmed.indexOf(".");
  if (dot !== -1) return trimmed.slice(0, dot + 1).trim();
  return trimmed.slice(0, 100).trim() + (trimmed.length > 100 ? "…" : "");
}

/**
 * Imperative diligence action (1 sentence). Use recommended_action or "Monitor."
 */
export function diligenceAction(recommended_action: string | null | undefined): string {
  if (recommended_action != null && typeof recommended_action === "string") {
    const t = recommended_action.trim();
    if (t.length > 0) return oneSentence(t);
  }
  return "Monitor.";
}
