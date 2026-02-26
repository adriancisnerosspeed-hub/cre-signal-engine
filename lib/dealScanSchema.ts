/**
 * Strict Zod schema for deal scan AI output (untrusted input).
 * Used server-side to validate and coerce before normalization.
 */

import { z } from "zod";

const ASSUMPTION_KEYS = [
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

const assumptionCellSchema = z.object({
  value: z.union([z.number(), z.string()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  confidence: z.string().optional(),
});

const assumptionsSchema = z.record(z.string(), assumptionCellSchema).optional().default({});

const riskSchema = z.object({
  risk_type: z.unknown().optional(),
  severity: z.unknown().optional(),
  what_changed_or_trigger: z.unknown().optional(),
  why_it_matters: z.unknown().optional(),
  who_this_affects: z.unknown().optional(),
  recommended_action: z.unknown().optional(),
  confidence: z.unknown().optional(),
  evidence_snippets: z.array(z.unknown()).optional(),
});

export const dealScanRawSchema = z.object({
  assumptions: assumptionsSchema,
  risks: z.array(riskSchema).optional().default([]),
});

export type DealScanRawSchema = z.infer<typeof dealScanRawSchema>;

/**
 * Validate untrusted parsed object. Returns safe DealScanRaw-shaped object or null on failure.
 */
export function validateDealScanRaw(parsed: unknown): { assumptions: Record<string, unknown>; risks: unknown[] } | null {
  const result = dealScanRawSchema.safeParse(parsed);
  if (!result.success) return null;
  const d = result.data;
  const assumptions: Record<string, unknown> = {};
  if (d.assumptions && typeof d.assumptions === "object") {
    for (const key of Object.keys(d.assumptions)) {
      if (ASSUMPTION_KEYS.includes(key as (typeof ASSUMPTION_KEYS)[number])) {
        assumptions[key] = d.assumptions[key];
      }
    }
  }
  const risks = Array.isArray(d.risks) ? d.risks : [];
  return { assumptions, risks };
}
