import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { hash } from "bcryptjs";

export const runtime = "nodejs";

type Params = { params: Promise<{ scanId: string }> };

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    body = {};
  }
  const rawPw = typeof body.password === "string" ? body.password.trim() : "";
  const password_hash = rawPw.length > 0 ? await hash(rawPw, 10) : null;

  const { scanId } = await params;
  if (!scanId || typeof scanId !== "string" || scanId.trim() === "") {
    return NextResponse.json({ error: "Scan ID is required" }, { status: 400 });
  }
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const service = createServiceRoleClient();

  // Verify scan exists and belongs to user's org (two-step to avoid embed/join issues)
  const { data: scan, error: scanError } = await service
    .from("deal_scans")
    .select("id, deal_id")
    .eq("id", scanId)
    .maybeSingle();

  if (scanError) {
    console.error("[share] deal_scans lookup error:", scanError);
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const dealId = (scan as { deal_id: string }).deal_id;
  const { data: deal, error: dealError } = await service
    .from("deals")
    .select("organization_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !deal) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }
  const dealOrg = (deal as { organization_id: string }).organization_id;
  if (dealOrg !== orgId) {
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
      password_protected: !!(existing as { password_hash?: string | null }).password_hash,
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const { error: insertError } = await service.from("memo_share_links").insert({
    scan_id: scanId,
    organization_id: orgId,
    token,
    created_by: user.id,
    ...(password_hash ? { password_hash } : {}),
  });

  if (insertError) {
    console.error("[share] insert error:", insertError);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  return NextResponse.json({
    token,
    url: `/shared/memo/${token}`,
    view_count: 0,
    password_protected: !!password_hash,
  });
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
    .select("id, token, view_count, created_at, expires_at, revoked_at, password_hash")
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
    password_hash: string | null;
  };

  return NextResponse.json({
    link: {
      id: l.id,
      token: l.token,
      url: `/shared/memo/${l.token}`,
      view_count: l.view_count,
      created_at: l.created_at,
      expires_at: l.expires_at,
      password_protected: !!l.password_hash,
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
