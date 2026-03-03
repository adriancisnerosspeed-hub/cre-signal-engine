import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
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

  const { data: acceptable } = await service
    .from("organization_invites")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token_hash", tokenHash)
    .in("status", ["pending", "sent"])
    .gt("expires_at", now)
    .maybeSingle();

  if (acceptable) {
    invite = acceptable as InviteRow;
  }

  if (!invite) {
    const { data: byToken } = await service
      .from("organization_invites")
      .select("id, org_id, email, role, status, expires_at")
      .eq("token", token)
      .in("status", ["pending", "sent"])
      .gt("expires_at", now)
      .maybeSingle();
    if (byToken) invite = byToken as InviteRow;
  }

  if (!invite) {
    const { data: anyByHash } = await service
      .from("organization_invites")
      .select("id, org_id, email, role, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (anyByHash) {
      const row = anyByHash as InviteRow;
      if (row.expires_at <= now) {
        if (row.status !== "expired") {
          await service.from("organization_invites").update({ status: "expired" }).eq("id", row.id);
        }
        return NextResponse.json(
          { error: "This invite has expired", code: "EXPIRED_INVITE" },
          { status: 410 }
        );
      }
      if (row.status === "accepted") {
        const inviteEmail = row.email.trim().toLowerCase();
        const userEmail = (user.email ?? "").trim().toLowerCase();
        if (userEmail === inviteEmail) {
          return NextResponse.json({ success: true, org_id: row.org_id });
        }
      }
    } else {
      const { data: anyByToken } = await service
        .from("organization_invites")
        .select("id, org_id, email, role, status, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (anyByToken) {
        const row = anyByToken as InviteRow;
        if (row.expires_at <= now) {
          if (row.status !== "expired") {
            await service.from("organization_invites").update({ status: "expired" }).eq("id", row.id);
          }
          return NextResponse.json(
            { error: "This invite has expired", code: "EXPIRED_INVITE" },
            { status: 410 }
          );
        }
        if (row.status === "accepted") {
          const inviteEmail = row.email.trim().toLowerCase();
          const userEmail = (user.email ?? "").trim().toLowerCase();
          if (userEmail === inviteEmail) {
            return NextResponse.json({ success: true, org_id: row.org_id });
          }
        }
      }
    }
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

  const { data: rpcRows, error: rpcError } = await service.rpc("accept_organization_invite_with_cap", {
    p_invite_id: inv.id,
    p_user_id: user.id,
  });

  if (rpcError) {
    console.error("accept_organization_invite_with_cap error:", rpcError);
    return NextResponse.json({ error: "Failed to join workspace" }, { status: 500 });
  }

  const row = Array.isArray(rpcRows) && rpcRows.length > 0 ? rpcRows[0] : null;
  if (!row || typeof row.ok !== "boolean") {
    return NextResponse.json({ error: "Failed to join workspace" }, { status: 500 });
  }

  if (!row.ok && row.code === "MEMBER_LIMIT_REACHED") {
    return NextResponse.json(
      {
        error: "Workspace member limit reached.",
        code: ENTITLEMENT_ERROR_CODES.MEMBER_LIMIT_REACHED,
        required_plan: row.required_plan ?? "ENTERPRISE",
      },
      { status: 403 }
    );
  }

  if (!row.ok) {
    return NextResponse.json(
      { error: row.code === "INVITE_NOT_FOUND" ? "Invite not found" : "Failed to join workspace" },
      { status: row.code === "INVITE_NOT_FOUND" ? 404 : 500 }
    );
  }

  return NextResponse.json({ success: true, org_id: inv.org_id });
}
