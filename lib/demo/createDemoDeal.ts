/**
 * Create a demo deal for a newly created organization.
 * Idempotent — does nothing if the org already has a demo deal.
 * The scan is run with service role and does NOT count against FREE plan limits.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { runDemoScan } from "./runDemoScan";

const DEMO_DEAL_NAME = "Multifamily — Dallas TX (Demo)";
const DEMO_ASSET_TYPE = "Multifamily";
const DEMO_MARKET = "Dallas, TX";

const DEMO_RAW_TEXT =
  "Purchase price: $8,500,000. Cap rate in: 5.8%. LTV: 72%. Vacancy: 8%. " +
  "Rent growth: 4%. Expense growth: 3%. Exit cap rate: 6.2%. Hold period: 7 years. " +
  "Debt rate: 6.75%. NOI Year 1: $493,000. Class B multifamily, 64 units, Dallas TX, " +
  "strong in-migration submarket, stable occupancy history.";

export async function createDemoDeal(
  service: SupabaseClient,
  user: User,
  orgId: string
): Promise<void> {
  // Guard: do not create duplicate demo deals
  const { data: existing } = await service
    .from("deals")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return;
  }

  // Create the deal
  const { data: deal, error: dealError } = await service
    .from("deals")
    .insert({
      name: DEMO_DEAL_NAME,
      asset_type: DEMO_ASSET_TYPE,
      market: DEMO_MARKET,
      is_demo: true,
      organization_id: orgId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    console.error("[createDemoDeal] Failed to create demo deal:", dealError?.message ?? dealError);
    return;
  }

  const dealId = (deal as { id: string }).id;

  // Insert deal input — must complete before scan so scan pipeline has a deal_input row
  const { data: dealInput, error: inputError } = await service
    .from("deal_inputs")
    .insert({
      deal_id: dealId,
      raw_text: DEMO_RAW_TEXT,
    })
    .select("id")
    .single();

  if (inputError) {
    console.error("[createDemoDeal] Failed to create deal input:", inputError.message, inputError.code);
    // Continue: runDemoScan can run with rawText only; deal_input_id may be null
  }

  const dealInputId = dealInput ? (dealInput as { id: string }).id : null;

  try {
    await runDemoScan(service, {
      dealId,
      dealInputId,
      rawText: DEMO_RAW_TEXT,
      assetType: DEMO_ASSET_TYPE,
      market: DEMO_MARKET,
      createdBy: user.id,
      orgId,
    });
  } catch (err) {
    console.error("[createDemoDeal] runDemoScan threw:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
    throw err;
  }
}
