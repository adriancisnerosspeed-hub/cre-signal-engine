import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { logApiTokenRevoked } from "@/lib/eventLog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DELETE /api/settings/api-tokens/[id]
 * Revoke an API token. Enterprise only; OWNER/ADMIN only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected", code: "NO_WORKSPACE" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { plan } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (plan !== "ENTERPRISE") {
    return NextResponse.json(
      {
        error: "API tokens are available on Enterprise plan only.",
        code: ENTITLEMENT_ERROR_CODES.ENTERPRISE_REQUIRED,
        required_plan: "ENTERPRISE",
      },
      { status: 403 }
    );
  }

  const { data: member } = await service
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (member as { role?: string } | null)?.role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only workspace owners and admins can revoke API tokens.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { id: tokenId } = await params;
  if (!tokenId) {
    return NextResponse.json({ error: "Token id required", code: "MISSING_ID" }, { status: 400 });
  }

  const { data: token, error: fetchError } = await supabase
    .from("api_tokens")
    .select("id, organization_id")
    .eq("id", tokenId)
    .maybeSingle();

  if (fetchError || !token) {
    return NextResponse.json({ error: "Token not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if ((token as { organization_id: string }).organization_id !== orgId) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { error: deleteError } = await supabase.from("api_tokens").delete().eq("id", tokenId);

  if (deleteError) {
    console.error("[api-tokens] delete error", deleteError);
    return NextResponse.json({ error: deleteError.message, code: "DELETE_FAILED" }, { status: 500 });
  }

  logApiTokenRevoked({ org_id: orgId, user_id: user.id, token_id: tokenId });

  return NextResponse.json({ ok: true, revoked: true });
}
