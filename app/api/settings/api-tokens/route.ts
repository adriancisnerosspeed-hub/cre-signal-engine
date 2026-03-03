import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { hashApiToken } from "@/lib/apiAuth";
import { logApiTokenCreated } from "@/lib/eventLog";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/settings/api-tokens
 * List API tokens for the current org (masked). Enterprise only; OWNER/ADMIN only.
 */
export async function GET() {
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
  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
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
      { error: "Only workspace owners and admins can list API tokens.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { data: rows } = await supabase
    .from("api_tokens")
    .select("id, name, last_used_at, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const list = (rows ?? []).map((r: { id: string; name: string; last_used_at: string | null; created_at: string }) => ({
    id: r.id,
    name: r.name,
    last_used_at: r.last_used_at ?? null,
    created_at: r.created_at,
    token_preview: "••••••••", // never expose full token
  }));

  return NextResponse.json({ tokens: list });
}

/**
 * POST /api/settings/api-tokens
 * Create a new API token. Enterprise only; OWNER/ADMIN only. Raw token returned once in response.
 */
export async function POST(request: Request) {
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
  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
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
      { error: "Only workspace owners and admins can create API tokens.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required", code: "MISSING_NAME" }, { status: 400 });
  }

  const rawToken = `cre_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashApiToken(rawToken);

  const { data: token, error } = await supabase
    .from("api_tokens")
    .insert({
      organization_id: orgId,
      name,
      token_hash: tokenHash,
      created_by: user.id,
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A token with this name already exists.", code: "DUPLICATE_NAME" },
        { status: 409 }
      );
    }
    console.error("[api-tokens] create error", error);
    return NextResponse.json({ error: error.message, code: "INSERT_FAILED" }, { status: 500 });
  }

  logApiTokenCreated({
    org_id: orgId,
    user_id: user.id,
    token_id: (token as { id: string }).id,
    name: (token as { name: string }).name,
  });

  return NextResponse.json({
    id: (token as { id: string }).id,
    name: (token as { name: string }).name,
    created_at: (token as { created_at: string }).created_at,
    token: rawToken,
    message: "Store this token securely. It will not be shown again.",
  });
}
