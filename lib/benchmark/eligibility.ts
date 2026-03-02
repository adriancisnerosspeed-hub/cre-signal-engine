/**
 * Cohort eligibility: resolve (deal_id, scan_id) list from cohort rule + as_of_timestamp.
 * Uses only stable deal/deal_scan columns; deterministic ordering by deal_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CohortRule } from "./types";
import { validateRule, evaluateRule } from "./cohortRule";
import type { CohortEvalContext } from "./types";

export type EligibleMember = { deal_id: string; scan_id: string };

type DealRow = {
  id: string;
  asset_type: string | null;
  market: string | null;
  market_key: string | null;
  market_label: string | null;
  city: string | null;
  state: string | null;
  organization_id: string;
  created_at: string;
  ic_status: string | null;
};

type ScanRow = {
  id: string;
  deal_id: string;
  status: string;
  completed_at: string | null;
  risk_index_score: number | null;
  asset_type: string | null;
  market: string | null;
  risk_index_version: string | null;
};

function buildContext(deal: DealRow, scan: ScanRow): CohortEvalContext {
  const createdYear =
    deal.created_at != null
      ? new Date(deal.created_at).getUTCFullYear()
      : undefined;
  return {
    asset_type: deal.asset_type ?? scan.asset_type ?? null,
    market: deal.market ?? scan.market ?? null,
    market_key: deal.market_key ?? null,
    market_label: deal.market_label ?? null,
    city: deal.city ?? null,
    state: deal.state ?? null,
    organization_id: deal.organization_id,
    created_at: deal.created_at,
    vintage_year: createdYear,
    ic_status: deal.ic_status ?? null,
    status: scan.status,
    completed_at: scan.completed_at ?? null,
    risk_index_score: scan.risk_index_score ?? null,
    risk_index_version: scan.risk_index_version ?? null,
  };
}

/**
 * Resolve eligible (deal_id, scan_id) for a cohort.
 * For each deal uses the latest completed scan with completed_at <= as_of_timestamp.
 * Filters by rule and requires risk_index_score IS NOT NULL.
 */
export async function resolveEligible(
  supabase: SupabaseClient,
  params: {
    ruleJson: unknown;
    workspaceId: string | null;
    asOfTimestamp: string;
  }
): Promise<EligibleMember[]> {
  const rule = validateRule(params.ruleJson);
  if (!rule) return [];

  const asOf = params.asOfTimestamp;

  let dealQuery = supabase
    .from("deals")
    .select("id, asset_type, market, market_key, market_label, city, state, organization_id, created_at, ic_status");

  if (params.workspaceId) {
    dealQuery = dealQuery.eq("organization_id", params.workspaceId);
  }

  const { data: deals, error: dealsError } = await dealQuery;

  if (dealsError || !deals || deals.length === 0) {
    return [];
  }

  const dealIds = (deals as DealRow[]).map((d) => d.id);

  const { data: scans, error: scansError } = await supabase
    .from("deal_scans")
    .select("id, deal_id, status, completed_at, risk_index_score, asset_type, market, risk_index_version")
    .in("deal_id", dealIds)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .not("risk_index_score", "is", null)
    .lte("completed_at", asOf)
    .order("completed_at", { ascending: false });

  if (scansError || !scans) {
    return [];
  }

  const scanRows = scans as ScanRow[];
  const latestByDeal = new Map<string, ScanRow>();
  for (const s of scanRows) {
    if (!latestByDeal.has(s.deal_id)) {
      latestByDeal.set(s.deal_id, s);
    }
  }

  const result: EligibleMember[] = [];
  for (const deal of deals as DealRow[]) {
    const scan = latestByDeal.get(deal.id);
    if (!scan) continue;
    const ctx = buildContext(deal, scan);
    if (evaluateRule(rule, ctx)) {
      result.push({ deal_id: deal.id, scan_id: scan.id });
    }
  }

  result.sort((a, b) => a.deal_id.localeCompare(b.deal_id));
  return result;
}
