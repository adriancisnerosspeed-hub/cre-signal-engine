import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { sendWorkspaceInvite } from "@/lib/email/sendWorkspaceInvite";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const INVITE_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(supabase, user).catch(() => {});

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const entitlements = await getEntitlementsForUser(service, user.id);
  if (!entitlements.workspace_invites_enabled) {
    return NextResponse.json(
      { code: "PRO_REQUIRED_FOR_INVITE" },
      { status: 403 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();
  if (!org) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const role = body.role === "admin" ? "admin" : "member";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  const { data: invite, error: insertError } = await service
    .from("organization_invites")
    .insert({
      org_id: orgId,
      email,
      role,
      invited_by: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "An invite for this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const inviteId = (invite as { id: string }).id;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const inviteLink = `${baseUrl}/invite/accept?token=${rawToken}`;

  let inviterName = "A team member";
  const { data: profile } = await service.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (profile && typeof (profile as { full_name?: string }).full_name === "string") {
    const name = (profile as { full_name: string }).full_name.trim();
    if (name) inviterName = name;
  }

  let sendResult = await sendWorkspaceInvite({
    to: email,
    orgName: (org as { name: string }).name,
    inviterName,
    inviteLink,
  });

  if (!sendResult.success) {
    console.error("[workspace-invite] email send failed", { inviteId, error: sendResult.error });
    sendResult = await sendWorkspaceInvite({
      to: email,
      orgName: (org as { name: string }).name,
      inviterName,
      inviteLink,
    });
  }

  if (!sendResult.success) {
    return NextResponse.json({
      invite_id: inviteId,
      email_sent: false,
      error: sendResult.error,
    });
  }

  return NextResponse.json({ invite_id: inviteId, email_sent: true });
}
