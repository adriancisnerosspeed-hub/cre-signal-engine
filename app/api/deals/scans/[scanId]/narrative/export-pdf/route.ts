import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { buildIcMemoPdf } from "@/lib/export/buildIcMemoPdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const entitlements = await getEntitlementsForUser(service, user.id);

  if (!entitlements.ic_narrative_enabled) {
    return NextResponse.json(
      { error: "IC Memorandum Narrative is a Pro feature" },
      { status: 403 }
    );
  }

  // Fetch scan
  const { data: scan } = await service
    .from("deal_scans")
    .select("id, deal_id, risk_index_score, risk_index_band, created_at")
    .eq("id", scanId)
    .single();

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Fetch deal (name + org membership check)
  const { data: deal } = await service
    .from("deals")
    .select("id, name, organization_id")
    .eq("id", (scan as { deal_id: string }).deal_id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { data: members } = await service
    .from("organization_members")
    .select("user_id")
    .eq("org_id", (deal as { organization_id: string }).organization_id)
    .eq("user_id", user.id);

  if (!members?.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch narrative
  const { data: narrativeRow } = await service
    .from("deal_scan_narratives")
    .select("content")
    .eq("deal_scan_id", scanId)
    .maybeSingle();

  const narrative = (narrativeRow as { content: string } | null)?.content ?? null;

  if (!narrative) {
    return NextResponse.json({ error: "No narrative found for this scan" }, { status: 404 });
  }

  try {
    const pdfBytes = await buildIcMemoPdf({
      narrative,
      dealName:       (deal as { name?: string }).name,
      scanCreatedAt:  (scan as { created_at: string }).created_at,
      scanId,
      riskIndexScore: (scan as { risk_index_score: number | null }).risk_index_score,
      riskIndexBand:  (scan as { risk_index_band: string | null }).risk_index_band,
    });

    const safeName = ((deal as { name?: string }).name ?? "deal")
      .replace(/[^a-z0-9]/gi, "-")
      .slice(0, 30)
      .toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `ic-memo-${safeName}-${dateStr}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[ic-memo export-pdf]", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
