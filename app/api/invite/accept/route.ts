import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  const { data: invite, error: inviteError } = await service
    .from("organization_invites")
    .select("id, org_id, email, role")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const inv = invite as { id: string; org_id: string; email: string; role: string };
  const inviteEmail = inv.email.trim().toLowerCase();
  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (userEmail !== inviteEmail) {
    return NextResponse.json(
      { error: "This invite was sent to a different email address" },
      { status: 403 }
    );
  }

  const { error: insertError } = await service.from("organization_members").insert({
    org_id: inv.org_id,
    user_id: user.id,
    role: inv.role,
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "You are already a member" }, { status: 409 });
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
