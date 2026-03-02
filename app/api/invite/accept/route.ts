import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : null;
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const tokenHash = hashToken(token);

  type InviteRow = { id: string; org_id: string; email: string; role: string; status: string; expires_at: string };
  let invite: InviteRow | null = null;

  const { data: byHash, error: errHash } = await service
    .from("organization_invites")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!errHash && byHash) invite = byHash as InviteRow;

  if (!invite) {
    const { data: byToken } = await service
      .from("organization_invites")
      .select("id, org_id, email, role, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (byToken) invite = byToken as InviteRow;
  }

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite", code: "INVALID_INVITE" }, { status: 404 });
  }

  const inv = invite;
  const inviteEmail = inv.email.trim().toLowerCase();
  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (userEmail !== inviteEmail) {
    return NextResponse.json(
      { error: "This invite was sent to a different email address" },
      { status: 403 }
    );
  }

  if (inv.expires_at <= now) {
    if (inv.status !== "expired") {
      await service.from("organization_invites").update({ status: "expired" }).eq("id", inv.id);
    }
    return NextResponse.json(
      { error: "This invite has expired", code: "EXPIRED_INVITE" },
      { status: 410 }
    );
  }

  if (inv.status === "accepted") {
    return NextResponse.json({ success: true, org_id: inv.org_id });
  }

  if (inv.status !== "pending" && inv.status !== "sent") {
    return NextResponse.json({ error: "Invalid or expired invite", code: "INVALID_INVITE" }, { status: 404 });
  }

  const { error: insertError } = await service.from("organization_members").insert({
    org_id: inv.org_id,
    user_id: user.id,
    role: inv.role,
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return NextResponse.json({ success: true, org_id: inv.org_id });
    }
    console.error("organization_members insert error:", insertError);
    return NextResponse.json({ error: "Failed to join workspace" }, { status: 500 });
  }

  await service
    .from("organization_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  return NextResponse.json({ success: true, org_id: inv.org_id });
}
