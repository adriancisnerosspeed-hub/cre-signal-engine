import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

type Params = { params: Promise<{ scanId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const service = createServiceRoleClient();

  // Verify scan belongs to user's org
  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, deal_id, deals!inner(organization_id)")
    .eq("id", scanId)
    .single();

  if (scanError || !scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const scanDeal = scan as { deals: { organization_id: string } };
  if (scanDeal.deals.organization_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check for existing non-revoked link
  const { data: existing } = await service
    .from("memo_share_links")
    .select("id, token, view_count")
    .eq("scan_id", scanId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    const token = (existing as { token: string; view_count: number }).token;
    return NextResponse.json({
      token,
      url: `/shared/memo/${token}`,
      view_count: (existing as { view_count: number }).view_count,
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const { error: insertError } = await service.from("memo_share_links").insert({
    scan_id: scanId,
    organization_id: orgId,
    token,
    created_by: user.id,
  });

  if (insertError) {
    console.error("[share] insert error:", insertError);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  return NextResponse.json({ token, url: `/shared/memo/${token}`, view_count: 0 });
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const service = createServiceRoleClient();

  const { data: link } = await service
    .from("memo_share_links")
    .select("id, token, view_count, created_at, expires_at, revoked_at")
    .eq("scan_id", scanId)
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ link: null });
  }

  const l = link as {
    id: string;
    token: string;
    view_count: number;
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
  };

  return NextResponse.json({
    link: {
      id: l.id,
      token: l.token,
      url: `/shared/memo/${l.token}`,
      view_count: l.view_count,
      created_at: l.created_at,
      expires_at: l.expires_at,
    },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scanId } = await params;
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const service = createServiceRoleClient();

  const { error } = await service
    .from("memo_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("scan_id", scanId)
    .eq("organization_id", orgId)
    .is("revoked_at", null);

  if (error) {
    console.error("[share] revoke error:", error);
    return NextResponse.json({ error: "Failed to revoke link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
