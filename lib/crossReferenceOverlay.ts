import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNAL_WINDOW_DAYS = 30;

type SignalRow = {
  id: string | number;
  signal_type: string | null;
  what_changed: string | null;
};

type DealRiskRow = {
  id: string;
  risk_type: string;
  severity_current: string;
};

/**
 * Deterministic rules: which risk types can be linked to which signal types.
 */
function signalTypeMatchesRisk(signalType: string, riskType: string): boolean {
  const t = (signalType || "").toLowerCase();
  switch (riskType) {
    case "RefiRisk":
    case "DebtCostRisk":
    case "MarketLiquidityRisk":
      return (
        t.includes("credit") ||
        t.includes("liquidity") ||
        t.includes("lender") ||
        t.includes("financing")
      );
    case "ExitCapCompression":
      return t.includes("cap") || t.includes("spread") || t.includes("pricing");
    case "ExpenseUnderstated":
    case "InsuranceRisk":
      return t.includes("insurance") || t.includes("expense") || t.includes("policy");
    case "RentGrowthAggressive":
    case "VacancyUnderstated":
      return (
        t.includes("supply") ||
        t.includes("demand") ||
        t.includes("vacancy") ||
        t.includes("rent")
      );
    case "RegulatoryPolicyExposure":
      return t.includes("policy") || t.includes("regulatory");
    default:
      return false;
  }
}

/**
 * Optionally bump severity when we link a relevant macro signal.
 */
function bumpedSeverity(current: string): string {
  if (current === "High") return "High";
  if (current === "Low") return "Medium";
  return current;
}

/** True if signal appears to be multifamily supply (infer from signal_type; signals table has no asset_type). */
function isMultifamilySupplySignal(signalType: string): boolean {
  const t = signalType.toLowerCase();
  return (t.includes("multifamily") || t.includes("multi-family")) && (t.includes("supply") || t.includes("vacancy") || t.includes("demand"));
}

/** True if deal is multifamily by asset_type. */
function dealIsMultifamily(assetType: string | null | undefined): boolean {
  if (!assetType) return false;
  const a = assetType.toLowerCase();
  return a.includes("multifamily") || a.includes("multi-family") || a.includes("multifam");
}

/** Do not apply multifamily supply signals to office or retail. Same asset class filter. */
function signalAppliesToDeal(
  signalType: string,
  dealAssetType: string | null | undefined
): boolean {
  if (isMultifamilySupplySignal(signalType)) {
    if (!dealAssetType) return true;
    const a = dealAssetType.toLowerCase();
    if (a.includes("office") || a.includes("retail")) return false;
    return dealIsMultifamily(dealAssetType);
  }
  return true;
}

export type OverlayDealContext = {
  asset_type?: string | null;
  market?: string | null;
};

/**
 * Cross-reference overlay: link deal risks to macro signals using deal.created_by's signals.
 * Applies macro filter rules: same asset class (no multifamily supply to office/retail), etc.
 */
export async function runOverlay(
  supabase: SupabaseClient,
  dealScanId: string,
  createdByUserId: string,
  dealContext?: OverlayDealContext
): Promise<void> {
  const windowStart = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const dealAssetType = dealContext?.asset_type ?? null;

  const { data: signals, error: sigErr } = await supabase
    .from("signals")
    .select("id, signal_type, what_changed")
    .eq("user_id", createdByUserId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sigErr || !signals?.length) {
    return;
  }

  const signalRows = signals as SignalRow[];

  const { data: risks, error: riskErr } = await supabase
    .from("deal_risks")
    .select("id, risk_type, severity_current")
    .eq("deal_scan_id", dealScanId);

  if (riskErr || !risks?.length) {
    return;
  }

  const riskRows = risks as DealRiskRow[];

  type LinkRow = { deal_risk_id: string; signal_id: string; link_reason: string };
  const linkKey = (r: LinkRow) => `${r.deal_risk_id}:${r.signal_id}`;
  const seenKeys = new Set<string>();
  const linksToUpsert: LinkRow[] = [];
  const riskIdsWithLink: Set<string> = new Set();

  for (const risk of riskRows) {
    for (const signal of signalRows) {
      const st = (signal.signal_type ?? "").trim();
      if (!signalTypeMatchesRisk(st, risk.risk_type)) continue;
      if (!signalAppliesToDeal(st, dealAssetType)) continue;

      const reason = `Signal: ${st}${signal.what_changed ? ` — ${String(signal.what_changed).slice(0, 80)}` : ""}`;
      const row: LinkRow = {
        deal_risk_id: risk.id,
        signal_id: String(signal.id),
        link_reason: reason,
      };
      if (seenKeys.has(linkKey(row))) continue;
      seenKeys.add(linkKey(row));
      linksToUpsert.push(row);
      riskIdsWithLink.add(risk.id);
    }
  }

  if (linksToUpsert.length > 0) {
    await supabase
      .from("deal_signal_links")
      .upsert(linksToUpsert, {
        onConflict: "deal_risk_id,signal_id",
        ignoreDuplicates: true,
      });
  }

  for (const risk of riskRows) {
    if (!riskIdsWithLink.has(risk.id)) continue;
    const newSeverity = bumpedSeverity(risk.severity_current);
    if (newSeverity !== risk.severity_current) {
      await supabase
        .from("deal_risks")
        .update({ severity_current: newSeverity })
        .eq("id", risk.id);
    }
  }
}
