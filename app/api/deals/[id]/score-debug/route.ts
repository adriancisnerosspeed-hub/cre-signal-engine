import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";

/**
 * GET /api/deals/[id]/score-debug
 * Owner-only. Returns all completed scans for a deal with full breakdowns,
 * risks, and assumptions so the client can build a deterministic diff.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: dealId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOwner(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Verify deal belongs to org
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Fetch all completed scans with breakdowns
  const { data: scans, error: scanErr } = await supabase
    .from("deal_scans")
    .select(
      "id, created_at, model, prompt_version, status, risk_index_score, risk_index_band, risk_index_version, risk_index_breakdown, input_text_hash, scoring_input_hash, extraction"
    )
    .eq("deal_id", dealId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (scanErr) {
    return NextResponse.json({ error: scanErr.message }, { status: 500 });
  }

  // Fetch risks for all scans
  const scanIds = (scans ?? []).map((s: { id: string }) => s.id);
  let risksByScan: Record<
    string,
    { risk_type: string; severity_original: string; severity_current: string; confidence: string | null }[]
  > = {};

  if (scanIds.length > 0) {
    const { data: riskRows } = await supabase
      .from("deal_risks")
      .select("deal_scan_id, risk_type, severity_original, severity_current, confidence")
      .in("deal_scan_id", scanIds)
      .order("risk_type", { ascending: true });

    for (const r of riskRows ?? []) {
      const sid = r.deal_scan_id as string;
      if (!risksByScan[sid]) risksByScan[sid] = [];
      risksByScan[sid].push({
        risk_type: r.risk_type,
        severity_original: r.severity_original,
        severity_current: r.severity_current,
        confidence: r.confidence,
      });
    }
  }

  // Fetch audit log
  const { data: auditRows } = await supabase
    .from("risk_audit_log")
    .select("scan_id, previous_score, new_score, delta, band_change, model_version, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  const auditByScan: Record<string, (typeof auditRows extends (infer T)[] | null ? T : never)> = {};
  for (const a of auditRows ?? []) {
    if (a.scan_id) auditByScan[a.scan_id as string] = a;
  }

  // Build response
  const result = (scans ?? []).map((s: Record<string, unknown>) => {
    const assumptions = (s.extraction as Record<string, unknown>)?.assumptions ?? null;
    return {
      id: s.id,
      created_at: s.created_at,
      model: s.model,
      prompt_version: s.prompt_version,
      score: s.risk_index_score,
      band: s.risk_index_band,
      version: s.risk_index_version,
      breakdown: s.risk_index_breakdown,
      input_text_hash: s.input_text_hash,
      scoring_input_hash: s.scoring_input_hash,
      assumptions,
      risks: risksByScan[s.id as string] ?? [],
      audit: auditByScan[s.id as string] ?? null,
    };
  });

  return NextResponse.json({ scans: result });
}
