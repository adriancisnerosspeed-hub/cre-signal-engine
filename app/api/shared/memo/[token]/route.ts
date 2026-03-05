import { createServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const service = createServiceRoleClient();

  // Lookup share link
  const { data: link, error: linkError } = await service
    .from("memo_share_links")
    .select("id, scan_id, organization_id, view_count, expires_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (linkError || !link) {
    return NextResponse.json({ error: "Link not found or revoked" }, { status: 404 });
  }

  const l = link as {
    id: string;
    scan_id: string;
    organization_id: string;
    view_count: number;
    expires_at: string | null;
  };

  // Check expiry
  if (l.expires_at && new Date(l.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  // Increment view count (fire-and-forget)
  service
    .from("memo_share_links")
    .update({ view_count: l.view_count + 1 })
    .eq("id", l.id)
    .then(({ error }) => {
      if (error) console.warn("[shared/memo] view_count increment error:", error);
    });

  // Fetch scan data — public fields only (no raw_text, no financial extraction)
  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, created_at, risk_index_score, risk_index_band, deals!inner(name, asset_type, market)")
    .eq("id", l.scan_id)
    .single();

  if (scanError || !scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const s = scan as {
    id: string;
    created_at: string;
    risk_index_score: number | null;
    risk_index_band: string | null;
    deals: { name: string; asset_type: string | null; market: string | null };
  };

  // Fetch narrative (public to link holders)
  const { data: narrativeRow } = await service
    .from("deal_scan_narratives")
    .select("content")
    .eq("deal_scan_id", l.scan_id)
    .maybeSingle();

  const narrativeContent = (narrativeRow as { content?: string } | null)?.content ?? null;

  return NextResponse.json({
    deal_name: s.deals.name,
    asset_type: s.deals.asset_type,
    market: s.deals.market,
    scan_date: s.created_at,
    risk_index_score: s.risk_index_score,
    risk_index_band: s.risk_index_band,
    narrative: narrativeContent,
    view_count: l.view_count + 1,
  });
}
