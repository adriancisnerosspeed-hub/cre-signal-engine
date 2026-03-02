/**
 * Server-side risk policy evaluation. Deterministic: same inputs → same outputs.
 * Consumes PortfolioSummary and policy rules_json; returns violations and recommended actions.
 */

import type { PortfolioSummary } from "@/lib/portfolioSummary";
import { parseRules } from "./validate";
import type {
  RiskPolicyRow,
  PolicyRule,
  PolicyEvaluationResult,
  PolicyViolation,
  PolicyAction,
  PolicyActionCode,
} from "./types";

const PORTFOLIO_STALE_DAYS = 30;

function buildSummary(portfolio: PortfolioSummary): PolicyEvaluationResult["summary"] {
  const scanned = portfolio.counts.scanned;
  const total = portfolio.counts.total;
  const elevatedPlus =
    scanned > 0
      ? ((portfolio.distributionByBand["Elevated"] ?? 0) + (portfolio.distributionByBand["High"] ?? 0)) / scanned
      : 0;
  const highPct = scanned > 0 ? (portfolio.distributionByBand["High"] ?? 0) / scanned : 0;
  const stalePct = scanned > 0 ? (portfolio.counts.stale / scanned) * 100 : 0;
  const deteriorated =
    portfolio.risk_movement?.deal_ids?.deteriorated?.length ?? 0;
  const deterioratingPct = scanned > 0 ? (deteriorated / scanned) * 100 : 0;

  return {
    scanned_count: scanned,
    unscanned_count: portfolio.counts.unscanned,
    stale_count: portfolio.counts.stale,
    elevated_plus_pct: Math.round(elevatedPlus * 1000) / 10,
    high_pct: Math.round(highPct * 1000) / 10,
    top_market_pct: portfolio.concentration?.topMarketPct ?? 0,
    top_asset_type_pct: portfolio.concentration?.topAssetTypePct ?? 0,
    prpi: portfolio.prpi?.prpi_score ?? 0,
    deteriorating_pct: Math.round(deterioratingPct * 10) / 10,
  };
}

function invalidPolicyResult(
  policy: RiskPolicyRow,
  nowIso: string
): PolicyEvaluationResult {
  const summary = {
    scanned_count: 0,
    unscanned_count: 0,
    stale_count: 0,
    elevated_plus_pct: 0,
    high_pct: 0,
    top_market_pct: 0,
    top_asset_type_pct: 0,
    prpi: 0,
    deteriorating_pct: 0,
  };
  return {
    policy_id: policy.id,
    policy_name: policy.name,
    evaluated_at: nowIso,
    overall_status: "WARN",
    violation_count: 1,
    violations: [
      {
        rule_id: "",
        rule_name: "Policy config",
        type: "INVALID_CONFIG",
        severity: "warn",
        metric_label: "Policy config invalid",
        actual_value: 0,
        threshold_value: 0,
        unit: "count",
        message: "Policy configuration is invalid. Edit the policy to fix rules.",
      },
    ],
    summary,
    recommended_actions: [
      {
        code: "EDIT_POLICY",
        priority: 1,
        title: "Edit policy",
        detail: "Fix invalid rule configuration in the policy editor.",
      },
    ],
  };
}

function evaluateRule(
  rule: PolicyRule,
  portfolio: PortfolioSummary,
  summary: PolicyEvaluationResult["summary"]
): PolicyViolation | null {
  const scanned = summary.scanned_count;
  const total = portfolio.counts.total;
  const denomScanned = scanned || 1;
  const denomAll = total || 1;

  switch (rule.type) {
    case "MAX_ELEVATED_PLUS_PCT": {
      const elevatedPlusCount = (portfolio.distributionByBand["Elevated"] ?? 0) + (portfolio.distributionByBand["High"] ?? 0);
      const actualPct =
        rule.scope === "scanned_only"
          ? summary.elevated_plus_pct
          : denomAll > 0 ? (elevatedPlusCount / denomAll) * 100 : 0;
      if (actualPct <= rule.threshold_pct) return null;
      const elevatedPlusDealIds = portfolio.deals
        .filter((d) => d.latest_risk_band === "Elevated" || d.latest_risk_band === "High")
        .map((d) => d.id);
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Elevated+ exposure",
        actual_value: Math.round(actualPct * 10) / 10,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `Elevated+ exposure is ${Math.round(actualPct * 10) / 10}% (max ${rule.threshold_pct}%).`,
        affected_deal_ids: elevatedPlusDealIds.length ? elevatedPlusDealIds : undefined,
      };
    }
    case "MAX_HIGH_PCT": {
      const highCount = portfolio.distributionByBand["High"] ?? 0;
      const actualPct =
        rule.scope === "scanned_only" ? summary.high_pct : (denomAll > 0 ? (highCount / denomAll) * 100 : 0);
      if (actualPct <= rule.threshold_pct) return null;
      const highDealIds = portfolio.deals.filter((d) => d.latest_risk_band === "High").map((d) => d.id);
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "High exposure",
        actual_value: Math.round(actualPct * 10) / 10,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `High risk exposure is ${Math.round(actualPct * 10) / 10}% (max ${rule.threshold_pct}%).`,
        affected_deal_ids: highDealIds.length ? highDealIds : undefined,
      };
    }
    case "MAX_TOP_MARKET_PCT":
      if (summary.top_market_pct <= rule.threshold_pct) return null;
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Top market concentration",
        actual_value: summary.top_market_pct,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `Top market share is ${summary.top_market_pct}% (max ${rule.threshold_pct}%).`,
      };
    case "MAX_TOP_ASSET_TYPE_PCT":
      if (summary.top_asset_type_pct <= rule.threshold_pct) return null;
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Top asset type concentration",
        actual_value: summary.top_asset_type_pct,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `Top asset type share is ${summary.top_asset_type_pct}% (max ${rule.threshold_pct}%).`,
      };
    case "MAX_LTV_PCT": {
      const ltvByDeal = portfolio.dealLatestLtv ?? {};
      const overThreshold: string[] = [];
      for (const [dealId, ltv] of Object.entries(ltvByDeal)) {
        if (ltv > rule.threshold_pct) overThreshold.push(dealId);
      }
      if (overThreshold.length === 0) return null;
      const maxLtv = Math.max(...Object.values(ltvByDeal));
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Max LTV",
        actual_value: Math.round(maxLtv * 10) / 10,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `${overThreshold.length} deal(s) exceed LTV ${rule.threshold_pct}% (max ${Math.round(maxLtv * 10) / 10}%).`,
        affected_deal_ids: overThreshold,
      };
    }
    case "MAX_STALE_SCANS_PCT": {
      const stalePct = summary.stale_count / denomScanned * 100;
      if (stalePct <= rule.threshold_pct) return null;
      const staleDealIds = portfolio.deals.filter((d) =>
        portfolio.dealBadges?.get?.(d.id)?.includes("stale")
      ).map((d) => d.id);
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Stale scans",
        actual_value: Math.round(stalePct * 10) / 10,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `${Math.round(stalePct * 10) / 10}% of scans are stale (max ${rule.threshold_pct}%).`,
        affected_deal_ids: staleDealIds.length ? staleDealIds : undefined,
      };
    }
    case "MAX_PRPI":
      if (summary.prpi <= rule.threshold) return null;
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "PRPI",
        actual_value: summary.prpi,
        threshold_value: rule.threshold,
        unit: "score",
        message: `Portfolio Risk Pressure Index is ${summary.prpi} (max ${rule.threshold}).`,
      };
    case "MAX_DETERIORATING_PCT":
      if (summary.deteriorating_pct <= rule.threshold_pct) return null;
      const deterioratedIds = portfolio.risk_movement?.deal_ids?.deteriorated ?? [];
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        type: rule.type,
        severity: rule.severity,
        metric_label: "Deteriorating deals",
        actual_value: Math.round(summary.deteriorating_pct * 10) / 10,
        threshold_value: rule.threshold_pct,
        unit: "pct",
        message: `${Math.round(summary.deteriorating_pct * 10) / 10}% of scanned deals deteriorated (max ${rule.threshold_pct}%).`,
        affected_deal_ids: deterioratedIds.length ? deterioratedIds : undefined,
      };
    default:
      return null;
  }
}

function buildRecommendedActions(
  portfolio: PortfolioSummary,
  violations: PolicyViolation[]
): PolicyAction[] {
  const actions: PolicyAction[] = [];
  const added = new Set<PolicyActionCode>();

  if (portfolio.counts.unscanned > 0) {
    const unscannedIds = portfolio.deals.filter((d) => !d.latest_scan_id).map((d) => d.id);
    if (!added.has("SCAN_UNSCANNED")) {
      actions.push({
        code: "SCAN_UNSCANNED",
        priority: 1,
        title: "Scan unscanned deals",
        detail: `${portfolio.counts.unscanned} deal(s) have no scan. Run first scans to include in policy evaluation.`,
        deal_ids: unscannedIds.length ? unscannedIds : undefined,
      });
      added.add("SCAN_UNSCANNED");
    }
  } else if (portfolio.counts.scanned === 0 && portfolio.counts.total > 0) {
    if (!added.has("RUN_FIRST_SCANS")) {
      actions.push({
        code: "RUN_FIRST_SCANS",
        priority: 1,
        title: "Run first scans",
        detail: "No deals are scanned yet. Run scans to evaluate policy.",
      });
      added.add("RUN_FIRST_SCANS");
    }
  }

  if (portfolio.counts.stale > 0) {
    const staleIds = portfolio.deals.filter((d) =>
      portfolio.dealBadges?.get?.(d.id)?.includes("stale")
    ).map((d) => d.id);
    if (!added.has("RESCAN_STALE")) {
      actions.push({
        code: "RESCAN_STALE",
        priority: 2,
        title: "Rescan stale deals",
        detail: `${portfolio.counts.stale} scan(s) are over ${PORTFOLIO_STALE_DAYS} days old.`,
        deal_ids: staleIds.length ? staleIds : undefined,
      });
      added.add("RESCAN_STALE");
    }
  }

  const highViolation = violations.find((v) => v.type === "MAX_HIGH_PCT");
  if (highViolation?.affected_deal_ids?.length) {
    if (!added.has("REDUCE_HIGH_RISK")) {
      actions.push({
        code: "REDUCE_HIGH_RISK",
        priority: 3,
        title: "Reduce high risk exposure",
        detail: highViolation.message,
        deal_ids: highViolation.affected_deal_ids,
      });
      added.add("REDUCE_HIGH_RISK");
    }
  }

  const detViolation = violations.find((v) => v.type === "MAX_DETERIORATING_PCT");
  if (detViolation?.affected_deal_ids?.length) {
    if (!added.has("REVIEW_DETERIORATIONS")) {
      actions.push({
        code: "REVIEW_DETERIORATIONS",
        priority: 3,
        title: "Review deteriorating deals",
        detail: detViolation.message,
        deal_ids: detViolation.affected_deal_ids,
      });
      added.add("REVIEW_DETERIORATIONS");
    }
  }

  const ltvViolation = violations.find((v) => v.type === "MAX_LTV_PCT");
  if (ltvViolation?.affected_deal_ids?.length) {
    if (!added.has("DELEVERAGE")) {
      actions.push({
        code: "DELEVERAGE",
        priority: 4,
        title: "Reduce leverage",
        detail: ltvViolation.message,
        deal_ids: ltvViolation.affected_deal_ids,
      });
      added.add("DELEVERAGE");
    }
  }

  const concViolation = violations.find(
    (v) => v.type === "MAX_TOP_MARKET_PCT" || v.type === "MAX_TOP_ASSET_TYPE_PCT"
  );
  if (concViolation) {
    if (!added.has("REDUCE_CONCENTRATION")) {
      actions.push({
        code: "REDUCE_CONCENTRATION",
        priority: 4,
        title: "Reduce concentration",
        detail: concViolation.message,
        deal_ids: concViolation.affected_deal_ids,
      });
      added.add("REDUCE_CONCENTRATION");
    }
  }

  actions.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return actions;
}

export function evaluateRiskPolicy(params: {
  policy: RiskPolicyRow;
  portfolio: PortfolioSummary;
  nowIso: string;
}): PolicyEvaluationResult {
  const { policy, portfolio, nowIso } = params;
  const rules = parseRules(policy.rules_json);
  if (!rules) return invalidPolicyResult(policy, nowIso);

  const summary = buildSummary(portfolio);
  const violations: PolicyViolation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const v = evaluateRule(rule, portfolio, summary);
    if (v) violations.push(v);
  }

  const recommended_actions = buildRecommendedActions(portfolio, violations);
  const overall_status: "PASS" | "WARN" | "BLOCK" =
    violations.length === 0 ? "PASS" : violations.some((v) => v.severity === "block") ? "BLOCK" : "WARN";

  return {
    policy_id: policy.id,
    policy_name: policy.name,
    evaluated_at: nowIso,
    overall_status,
    violation_count: violations.length,
    violations,
    summary,
    recommended_actions,
  };
}
