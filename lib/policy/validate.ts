/**
 * Runtime validation for risk policy rules_json.
 * Invalid config → engine returns single "Policy config invalid" violation (no crash).
 */

import { z } from "zod";
import type { PolicyRule } from "./types";

const policyRuleBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  severity: z.enum(["warn", "block"]),
});

const scopeSchema = z.enum(["scanned_only", "all_deals"]);

const maxElevatedPlusPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_ELEVATED_PLUS_PCT"),
  threshold_pct: z.number(),
  scope: scopeSchema.default("scanned_only"),
});

const maxHighPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_HIGH_PCT"),
  threshold_pct: z.number(),
  scope: scopeSchema.default("scanned_only"),
});

const maxTopMarketPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_TOP_MARKET_PCT"),
  threshold_pct: z.number(),
  scope: scopeSchema.default("all_deals"),
});

const maxTopAssetTypePctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_TOP_ASSET_TYPE_PCT"),
  threshold_pct: z.number(),
  scope: scopeSchema.default("all_deals"),
});

const maxLtvPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_LTV_PCT"),
  threshold_pct: z.number(),
  scope: z.literal("scanned_only"),
  applies_to: z.enum(["scanned_deals_only", "all_scanned"]).optional().default("all_scanned"),
});

const maxStaleScansPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_STALE_SCANS_PCT"),
  threshold_pct: z.number(),
  stale_days: z.number().optional(),
});

const maxPrpiSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_PRPI"),
  threshold: z.number(),
});

const maxDeterioratingPctSchema = policyRuleBaseSchema.extend({
  type: z.literal("MAX_DETERIORATING_PCT"),
  threshold_pct: z.number(),
  delta_points: z.number().optional(),
});

const policyRuleSchema = z.discriminatedUnion("type", [
  maxElevatedPlusPctSchema,
  maxHighPctSchema,
  maxTopMarketPctSchema,
  maxTopAssetTypePctSchema,
  maxLtvPctSchema,
  maxStaleScansPctSchema,
  maxPrpiSchema,
  maxDeterioratingPctSchema,
]);

const rulesArraySchema = z.array(policyRuleSchema);

/**
 * Parse and validate rules_json. Returns array of rules or null if invalid.
 */
export function parseRules(rulesJson: unknown): PolicyRule[] | null {
  if (!Array.isArray(rulesJson)) return null;
  const result = rulesArraySchema.safeParse(rulesJson);
  if (!result.success) return null;
  return result.data as PolicyRule[];
}
