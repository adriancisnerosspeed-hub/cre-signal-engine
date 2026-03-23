import { createServiceRoleClient } from "@/lib/supabase/service";
import { isMemoShareUnlockedFromRequest } from "@/lib/memoShareUnlock";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  console.log("[shared/memo] GET token:", token);

  const service = createServiceRoleClient();

  // Lookup share link: memo_share_links by token, revoked_at IS NULL
  const { data: link, error: linkError } = await service
    .from("memo_share_links")
    .select("id, scan_id, organization_id, view_count, expires_at, password_hash")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  console.log("[shared/memo] memo_share_links result:", linkError ? { error: linkError } : { link: link ?? null });

  if (linkError || !link) {
    return NextResponse.json({ error: "Link not found or revoked" }, { status: 404 });
  }

  const l = link as {
    id: string;
    scan_id: string;
    organization_id: string;
    view_count: number;
    expires_at: string | null;
    password_hash: string | null;
  };

  // Check expiry
  if (l.expires_at && new Date(l.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  const unlocked = await isMemoShareUnlockedFromRequest(token, l.password_hash, request);
  if (!unlocked) {
    return NextResponse.json(
      { error: "Password required", password_required: true },
      { status: 401 }
    );
  }

  // Increment view count (fire-and-forget)
  service
    .from("memo_share_links")
    .update({ view_count: l.view_count + 1 })
    .eq("id", l.id)
    .then(({ error }) => {
      if (error) console.warn("[shared/memo] view_count increment error:", error);
    });

  // Fetch scan (two-step: deal_scans then deals — avoid embed/join failure)
  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, created_at, risk_index_score, risk_index_band, deal_id")
    .eq("id", l.scan_id)
    .maybeSingle();

  if (scanError) {
    console.error("[shared/memo] deal_scans lookup error:", scanError);
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  if (!scan) {
    console.log("[shared/memo] deal_scans: no row for scan_id", l.scan_id);
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const scanRow = scan as { id: string; created_at: string; risk_index_score: number | null; risk_index_band: string | null; deal_id: string };
  const { data: deal, error: dealError } = await service
    .from("deals")
    .select("name, asset_type, market")
    .eq("id", scanRow.deal_id)
    .maybeSingle();

  if (dealError || !deal) {
    console.error("[shared/memo] deals lookup error:", dealError);
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  const dealData = deal as { name: string; asset_type: string | null; market: string | null };

  // Fetch narrative from deal_scan_narratives.content
  const { data: narrativeRow } = await service
    .from("deal_scan_narratives")
    .select("content")
    .eq("deal_scan_id", l.scan_id)
    .maybeSingle();

  const narrativeContent = (narrativeRow as { content?: string } | null)?.content ?? null;
  console.log("[shared/memo] narrative:", narrativeContent == null ? "null" : `${(narrativeContent as string).length} chars`);

  return NextResponse.json({
    deal_name: dealData?.name ?? null,
    asset_type: dealData?.asset_type ?? null,
    market: dealData?.market ?? null,
    scan_date: scanRow.created_at,
    risk_index_score: scanRow.risk_index_score,
    risk_index_band: scanRow.risk_index_band,
    narrative: narrativeContent,
    view_count: l.view_count + 1,
  });
}
