/**
 * Seed script for risk policy QA: creates 6 deals and one enabled policy that trigger violations.
 * Run: npx tsx scripts/seedPolicyFixtures.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY, and optionally pass org ID and user ID as env or args.
 * Creates: 3 deals same market (concentration), 2 Elevated+ and 1 High (elevated+ rule),
 *          2 with stale scans, 1 with LTV=85 in assumptions; 1 policy with low thresholds.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const orgId = process.env.ORG_ID ?? process.argv[2];
const userId = process.env.USER_ID ?? process.argv[3];
if (!orgId || !userId) {
  console.error("Pass ORG_ID and USER_ID (env or args): npx tsx scripts/seedPolicyFixtures.ts <orgId> <userId>");
  process.exit(1);
}

const service = createClient(supabaseUrl, supabaseKey);
const MARKET = "New York, NY";
const MARKET_KEY = "new_york_ny";
const STALE_AT = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
const NOW = new Date().toISOString();

async function main() {
  const dealIds: string[] = [];
  const extractionLtv85 = {
    assumptions: {
      ltv: { value: 85, unit: "%", confidence: "High" },
      vacancy: { value: 15, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5, unit: "%", confidence: "High" },
      purchase_price: { value: 12_000_000, unit: null, confidence: "High" },
      noi_year1: { value: 600_000, unit: null, confidence: "High" },
      debt_rate: { value: 5.5, unit: "%", confidence: "High" },
    },
    risks: [],
  };
  const extractionModerate = {
    assumptions: {
      ltv: { value: 65, unit: "%", confidence: "High" },
      vacancy: { value: 10, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5, unit: "%", confidence: "High" },
      purchase_price: { value: 10_000_000, unit: null, confidence: "High" },
      noi_year1: { value: 500_000, unit: null, confidence: "High" },
      debt_rate: { value: 5, unit: "%", confidence: "High" },
    },
    risks: [],
  };

  for (let i = 0; i < 6; i++) {
    const name =
      i < 3 ? `Seed Policy Deal ${i + 1} (same market)` : i === 3 ? "Seed Policy Deal 4 (Moderate)" : i === 4 ? "Seed Policy Deal 5 (stale)" : "Seed Policy Deal 6 (stale, LTV 85)";
    const { data: deal, error: dealErr } = await service
      .from("deals")
      .insert({
        organization_id: orgId,
        created_by: userId,
        name,
        asset_type: "Multifamily",
        market: MARKET,
        market_key: MARKET_KEY,
        market_label: MARKET,
      })
      .select("id")
      .single();
    if (dealErr || !deal) {
      console.error("Deal insert error", dealErr);
      process.exit(1);
    }
    const dealId = (deal as { id: string }).id;
    dealIds.push(dealId);
    await service.from("deal_inputs").insert({ deal_id: dealId, raw_text: null });

    const isStale = i === 4 || i === 5;
    const completedAt = isStale ? STALE_AT : NOW;
    const extraction = i === 5 ? extractionLtv85 : extractionModerate;
    const score = i === 2 ? 72 : i < 3 ? 55 : 50;
    const band = i === 2 ? "High" : i < 3 ? "Elevated" : "Moderate";

    const { data: scan, error: scanErr } = await service
      .from("deal_scans")
      .insert({
        deal_id: dealId,
        deal_input_id: null,
        input_text_hash: null,
        extraction,
        status: "completed",
        completed_at: completedAt,
        model: "seed",
        prompt_version: null,
        ltv: (extraction.assumptions as { ltv?: { value?: number } }).ltv?.value ?? null,
        risk_index_score: score,
        risk_index_band: band,
        risk_index_breakdown: {},
        risk_index_version: "2.0",
        macro_linked_count: 0,
      })
      .select("id")
      .single();
    if (scanErr || !scan) {
      console.error("Scan insert error", scanErr);
      process.exit(1);
    }
    const scanId = (scan as { id: string }).id;
    await service
      .from("deals")
      .update({
        latest_scan_id: scanId,
        latest_risk_score: score,
        latest_risk_band: band,
        latest_scanned_at: completedAt,
        scan_count: 1,
        updated_at: NOW,
      })
      .eq("id", dealId);
  }

  const policyRules = [
    { id: `rule-elevated-${Date.now()}`, name: "Max Elevated+ 25%", type: "MAX_ELEVATED_PLUS_PCT", threshold_pct: 25, scope: "scanned_only", enabled: true, severity: "warn" as const },
    { id: `rule-market-${Date.now()}`, name: "Max Top Market 40%", type: "MAX_TOP_MARKET_PCT", threshold_pct: 40, scope: "all_deals", enabled: true, severity: "warn" as const },
    { id: `rule-ltv-${Date.now()}`, name: "Max LTV 80%", type: "MAX_LTV_PCT", threshold_pct: 80, scope: "scanned_only", applies_to: "all_scanned" as const, enabled: true, severity: "warn" as const },
    { id: `rule-stale-${Date.now()}`, name: "Max Stale 20%", type: "MAX_STALE_SCANS_PCT", threshold_pct: 20, enabled: true, severity: "warn" as const },
  ];
  const { data: policy, error: policyErr } = await service
    .from("risk_policies")
    .insert({
      organization_id: orgId,
      created_by: userId,
      name: "Institutional Guardrails (seed)",
      description: "Seed policy for QA; thresholds set to trigger violations.",
      is_enabled: true,
      is_shared: true,
      severity_threshold: "warn",
      rules_json: policyRules,
    })
    .select("id")
    .single();
  if (policyErr || !policy) {
    console.error("Policy insert error", policyErr);
    process.exit(1);
  }

  console.log("Seed complete. deal_ids:", dealIds);
  console.log("policy_id:", (policy as { id: string }).id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
