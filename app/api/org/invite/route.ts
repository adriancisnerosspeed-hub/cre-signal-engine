import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
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

  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canInviteMembers) {
    return NextResponse.json(
      {
        error: "Workspace invites require a paid plan.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }

  if (entitlements.maxMembers != null) {
    const { count, error: countError } = await service
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (!countError && count != null && count >= entitlements.maxMembers) {
      const required_plan = plan === "PRO" ? "PRO+" : "ENTERPRISE";
      return NextResponse.json(
        {
          error: "Workspace member limit reached.",
          code: ENTITLEMENT_ERROR_CODES.MEMBER_LIMIT_REACHED,
          required_plan,
        },
        { status: 403 }
      );
    }
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
  let inviterName = "A team member";
  const { data: profile } = await service.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (profile && typeof (profile as { full_name?: string }).full_name === "string") {
    const name = (profile as { full_name: string }).full_name.trim();
    if (name) inviterName = name;
  }

  const { error: outboxError } = await service.from("email_outbox").insert({
    type: "ORG_INVITE",
    recipient: email,
    payload_json: {
      invite_id: inviteId,
      organization_id: orgId,
      org_name: (org as { name: string }).name,
      inviter_name: inviterName,
    },
    dedupe_key: `org_invite:${inviteId}:v1`,
    status: "QUEUED",
  });

  if (outboxError) {
    console.error("[workspace-invite] outbox insert failed", { inviteId, error: outboxError });
    return NextResponse.json({ error: "Failed to queue invite email" }, { status: 500 });
  }

  return NextResponse.json({ invite_id: inviteId, email_queued: true });
}
