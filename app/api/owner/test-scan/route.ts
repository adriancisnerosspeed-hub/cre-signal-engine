import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/ownerAuth";
import { computeRiskIndex, RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { applySeverityOverride } from "@/lib/riskSeverityOverrides";
import type { DealScanAssumptions, DealScanRisk } from "@/lib/dealScanContract";

export const runtime = "nodejs";

const BASE_RISKS: DealScanRisk[] = [
  {
    risk_type: "RefiRisk",
    severity: "High",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "High",
    evidence_snippets: [],
  },
  {
    risk_type: "MarketLiquidityRisk",
    severity: "Medium",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "Medium",
    evidence_snippets: [],
  },
  {
    risk_type: "ExitCapCompression",
    severity: "Medium",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "High",
    evidence_snippets: [],
  },
];

/**
 * Dry-run Risk Index computation (no OpenAI, no DB writes). Used to validate scoring in dev.
 */
export async function POST(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: {
    ltv?: number;
    vacancy?: number;
    cap_rate_in?: number;
    exit_cap?: number;
    hold_period_years?: number;
  } = {};

  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") body = raw;
  } catch {
    // empty body defaults
  }

  const assumptions: DealScanAssumptions = {
    ltv: { value: body.ltv ?? 75, unit: "%", confidence: "High" },
    vacancy: { value: body.vacancy ?? 8, unit: "%", confidence: "High" },
    cap_rate_in: { value: body.cap_rate_in ?? 5.5, unit: "%", confidence: "High" },
    exit_cap: { value: body.exit_cap ?? 5.25, unit: "%", confidence: "High" },
    hold_period_years: { value: body.hold_period_years ?? 5, unit: "years", confidence: "High" },
  };

  const { assumptions: assumptionsForScoring } = normalizeAssumptionsForScoringWithFlags(assumptions);
  const stabilizedRisks = BASE_RISKS.map((r) => ({
    ...r,
    severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring),
  }));

  const result = computeRiskIndex({
    risks: stabilizedRisks.map((r) => ({
      severity_current: r.severity_current,
      confidence: r.confidence,
      risk_type: r.risk_type,
    })),
    assumptions: assumptionsForScoring,
    macroLinkedCount: 0,
  });

  return NextResponse.json({
    dry_run: true,
    risk_index_version: RISK_INDEX_VERSION,
    score: result.score,
    band: result.band,
    breakdown: result.breakdown,
  });
}
