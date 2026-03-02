/**
 * Internal-only QA fixture generator. Creates demo-grade stress cases without manual SQL.
 * Auth: user required. Allowed when user.role === "owner" OR process.env.ENABLE_FIXTURES === "true".
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getCurrentUserRole } from "@/lib/auth";
import { buildFixtureScenarios, type FixtureType } from "@/lib/fixtureBuilder";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { applySeverityOverride } from "@/lib/riskSeverityOverrides";
import { computeRiskIndex, RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { normalizeMarket } from "@/lib/normalizeMarket";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FIXTURE_TYPES: FixtureType[] = [
  "UNIT_INFERENCE",
  "EXTREME_LEVERAGE",
  "VERSION_DRIFT",
  "DRIVER_CAP",
  "DETERIORATION",
];

function isAllowedType(t: string): t is FixtureType {
  return FIXTURE_TYPES.includes(t as FixtureType);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  const allowFixtures = process.env.ENABLE_FIXTURES === "true";
  if (role !== "owner" && !allowFixtures) {
    return NextResponse.json({ error: "Forbidden: fixtures require owner role or ENABLE_FIXTURES" }, { status: 403 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  let body: { type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!isAllowedType(type)) {
    return NextResponse.json(
      { error: "Invalid type", allowed: FIXTURE_TYPES },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();
  const scenarios = buildFixtureScenarios(type);

  const norm = normalizeMarket({ city: null, state: null, market: null });
  const { data: deal, error: dealError } = await service
    .from("deals")
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: `Fixture: ${type}`,
      asset_type: "Multifamily",
      market: norm.market_label ?? null,
      city: norm.city ?? null,
      state: norm.state ?? null,
      market_key: norm.market_key ?? null,
      market_label: norm.market_label ?? null,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    console.error("[fixtures] deal insert error:", dealError);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  const dealId = (deal as { id: string }).id;
  await service.from("deal_inputs").insert({ deal_id: dealId, raw_text: null });

  const scanIds: string[] = [];
  const completedAt = new Date().toISOString();

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const { assumptions: assumptionsForScoring, unitInferred } = normalizeAssumptionsForScoringWithFlags(scenario.assumptions);
    const extraction = { assumptions: scenario.assumptions, risks: scenario.risks } as Record<string, unknown>;
    const stabilizedRisks = scenario.risks.map((r) => ({
      ...r,
      severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring),
    }));

    const { data: scan, error: scanError } = await service
      .from("deal_scans")
      .insert({
        deal_id: dealId,
        deal_input_id: null,
        input_text_hash: null,
        extraction,
        status: "completed",
        completed_at: completedAt,
        model: "fixture",
        prompt_version: null,
        cap_rate_in: scenario.assumptions.cap_rate_in?.value ?? null,
        exit_cap: scenario.assumptions.exit_cap?.value ?? null,
        noi_year1: scenario.assumptions.noi_year1?.value ?? null,
        ltv: scenario.assumptions.ltv?.value ?? null,
        hold_period_years: scenario.assumptions.hold_period_years?.value ?? null,
        asset_type: "Multifamily",
        market: norm.market_label ?? null,
      })
      .select("id")
      .single();

    if (scanError || !scan) {
      console.error("[fixtures] scan insert error:", scanError);
      return NextResponse.json({ error: "Failed to create scan" }, { status: 500 });
    }

    const scanId = (scan as { id: string }).id;
    scanIds.push(scanId);

    for (const r of stabilizedRisks) {
      await service.from("deal_risks").insert({
        deal_scan_id: scanId,
        risk_type: r.risk_type,
        severity_original: r.severity,
        severity_current: r.severity_current,
        what_changed_or_trigger: r.what_changed_or_trigger,
        why_it_matters: r.why_it_matters,
        who_this_affects: r.who_this_affects,
        recommended_action: r.recommended_action,
        confidence: r.confidence,
        evidence_snippets: r.evidence_snippets,
      });
    }

    let previousScore: number | undefined;
    let previousVersion: string | null = null;
    const { data: prevScan } = await service
      .from("deal_scans")
      .select("risk_index_score, risk_index_version")
      .eq("deal_id", dealId)
      .eq("status", "completed")
      .neq("id", scanId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevScan) {
      const score = (prevScan as { risk_index_score?: number }).risk_index_score;
      previousVersion = (prevScan as { risk_index_version?: string | null }).risk_index_version ?? null;
      if (typeof score === "number") previousScore = score;
    }

    const riskIndex = computeRiskIndex({
      risks: stabilizedRisks.map((r) => ({
        severity_current: r.severity_current,
        confidence: r.confidence,
        risk_type: r.risk_type,
      })),
      assumptions: assumptionsForScoring,
      macroLinkedCount: 0,
      ...(previousScore != null && {
        previous_score: previousScore,
        previous_risk_index_version: previousVersion,
      }),
    });

    const deltaComparable = previousScore != null && previousVersion === RISK_INDEX_VERSION;
    let breakdown = riskIndex.breakdown;
    if (previousScore != null && !deltaComparable) {
      breakdown = {
        ...breakdown,
        previous_score: previousScore,
        delta_comparable: false,
        delta_score: undefined,
        delta_band: undefined,
        deterioration_flag: undefined,
      };
    }
    if (unitInferred) {
      const flags = (breakdown.edge_flags ?? []).slice();
      if (!flags.includes("EDGE_UNIT_INFERRED")) flags.push("EDGE_UNIT_INFERRED");
      breakdown = { ...breakdown, edge_flags: flags, review_flag: true };
    }

    const score = Math.max(0, Math.min(100, riskIndex.score));
    const band = ["Low", "Moderate", "Elevated", "High"].includes(riskIndex.band) ? riskIndex.band : "Moderate";

    let versionToStore = RISK_INDEX_VERSION;
    if (type === "VERSION_DRIFT" && i === 0) {
      versionToStore = "1.9";
    }

    await service
      .from("deal_scans")
      .update({
        risk_index_score: score,
        risk_index_band: band,
        risk_index_breakdown: breakdown,
        risk_index_version: versionToStore,
        macro_linked_count: 0,
      })
      .eq("id", scanId);

    await service.from("risk_audit_log").insert({
      deal_id: dealId,
      scan_id: scanId,
      previous_score: previousScore ?? null,
      new_score: score,
      delta: breakdown.delta_score ?? null,
      band_change: breakdown.delta_band ?? null,
      model_version: versionToStore,
      created_at: completedAt,
    }).then((r) => {
      if (r.error && (r.error as { code?: string }).code !== "23505") {
        console.warn("[fixtures] audit insert error", r.error);
      }
    });

    const { data: dealRow } = await service
      .from("deals")
      .select("scan_count")
      .eq("id", dealId)
      .single();
    const currentScanCount = (dealRow as { scan_count?: number } | null)?.scan_count ?? 0;

    await service
      .from("deals")
      .update({
        latest_scan_id: scanId,
        latest_risk_score: score,
        latest_risk_band: band,
        latest_scanned_at: completedAt,
        scan_count: currentScanCount + 1,
        updated_at: completedAt,
      })
      .eq("id", dealId);
  }

  return NextResponse.json({ deal_id: dealId, scan_ids: scanIds });
}
