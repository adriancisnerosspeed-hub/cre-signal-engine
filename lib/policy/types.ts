/**
 * Risk policy rule types and evaluation result shapes.
 * rules_json is validated at runtime (see validate.ts).
 */

export type PolicyRuleBase = {
  id: string;
  name: string;
  enabled: boolean;
  severity: "warn" | "block";
};

export type RuleMaxElevatedPlusPct = PolicyRuleBase & {
  type: "MAX_ELEVATED_PLUS_PCT";
  threshold_pct: number;
  scope: "scanned_only" | "all_deals";
};

export type RuleMaxHighPct = PolicyRuleBase & {
  type: "MAX_HIGH_PCT";
  threshold_pct: number;
  scope: "scanned_only" | "all_deals";
};

export type RuleMaxTopMarketPct = PolicyRuleBase & {
  type: "MAX_TOP_MARKET_PCT";
  threshold_pct: number;
  scope: "all_deals" | "scanned_only";
};

export type RuleMaxTopAssetTypePct = PolicyRuleBase & {
  type: "MAX_TOP_ASSET_TYPE_PCT";
  threshold_pct: number;
  scope: "all_deals" | "scanned_only";
};

export type RuleMaxLtvPct = PolicyRuleBase & {
  type: "MAX_LTV_PCT";
  threshold_pct: number;
  scope: "scanned_only";
  applies_to?: "scanned_deals_only" | "all_scanned";
};

export type RuleMaxStaleScansPct = PolicyRuleBase & {
  type: "MAX_STALE_SCANS_PCT";
  threshold_pct: number;
  stale_days?: number;
};

export type RuleMaxPrpi = PolicyRuleBase & {
  type: "MAX_PRPI";
  threshold: number;
};

export type RuleMaxDeterioratingPct = PolicyRuleBase & {
  type: "MAX_DETERIORATING_PCT";
  threshold_pct: number;
  delta_points?: number;
};

export type PolicyRule =
  | RuleMaxElevatedPlusPct
  | RuleMaxHighPct
  | RuleMaxTopMarketPct
  | RuleMaxTopAssetTypePct
  | RuleMaxLtvPct
  | RuleMaxStaleScansPct
  | RuleMaxPrpi
  | RuleMaxDeterioratingPct;

/** DB row shape for risk_policies (from Supabase). */
export type RiskPolicyRow = {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_shared: boolean;
  severity_threshold: string;
  rules_json: unknown;
  created_at: string;
  updated_at: string;
};

export type PolicyViolation = {
  rule_id: string;
  rule_name: string;
  type: string;
  severity: "warn" | "block";
  metric_label: string;
  actual_value: number;
  threshold_value: number;
  unit: "pct" | "count" | "score";
  message: string;
  affected_deal_ids?: string[];
};

export type PolicyActionCode =
  | "SCAN_UNSCANNED"
  | "RESCAN_STALE"
  | "REDUCE_CONCENTRATION"
  | "DELEVERAGE"
  | "REVIEW_DETERIORATIONS"
  | "REDUCE_HIGH_RISK"
  | "EDIT_POLICY"
  | "RUN_FIRST_SCANS";

export type PolicyAction = {
  code: PolicyActionCode;
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  detail: string;
  deal_ids?: string[];
};

export type PolicyEvaluationResult = {
  policy_id: string;
  policy_name: string;
  evaluated_at: string;
  overall_status: "PASS" | "WARN" | "BLOCK";
  violation_count: number;
  violations: PolicyViolation[];
  summary: {
    scanned_count: number;
    unscanned_count: number;
    stale_count: number;
    elevated_plus_pct: number;
    high_pct: number;
    top_market_pct: number;
    top_asset_type_pct: number;
    prpi: number;
    deteriorating_pct: number;
  };
  recommended_actions: PolicyAction[];
};
