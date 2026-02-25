import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(supabase, user).catch(() => {});

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return NextResponse.json({ error: "No workspace selected" }, { status: 400 });

  const { data: rows } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", orgId);

  const members: { user_id: string; role: string; email: string | null }[] = [];
  for (const row of rows ?? []) {
    const r = row as { user_id: string; role: string };
    const { data: userData } = await service.auth.admin.getUserById(r.user_id);
    members.push({
      user_id: r.user_id,
      role: r.role,
      email: userData?.user?.email ?? null,
    });
  }

  const myMember = members.find((m) => m.user_id === user.id);
  const canManage = myMember?.role === "owner" || myMember?.role === "admin";

  return NextResponse.json({
    members,
    current_user_id: user.id,
    can_manage: canManage,
  });
}
