import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "View id required" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("portfolio_views")
    .select("id, organization_id, created_by")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  if ((existing as { organization_id: string }).organization_id !== orgId) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  if ((existing as { created_by: string }).created_by !== user.id) {
    return NextResponse.json({ error: "Only the creator can edit this view" }, { status: 403 });
  }

  let body: { name?: string; config_json?: Record<string, unknown>; is_shared?: boolean; locked_method_version?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (body.config_json && typeof body.config_json === "object") updates.config_json = body.config_json;
  if (typeof body.is_shared === "boolean") updates.is_shared = body.is_shared;
  if (body.locked_method_version !== undefined) {
    if (!entitlements.canLockMethodVersion) {
      return NextResponse.json({ error: "Snapshot version lock is available on Analyst, Fund, and Enterprise plans only." }, { status: 403 });
    }
    updates.locked_method_version =
      body.locked_method_version === null || body.locked_method_version === ""
        ? null
        : typeof body.locked_method_version === "string"
          ? body.locked_method_version.trim()
          : undefined;
  }

  const { data: view, error } = await supabase
    .from("portfolio_views")
    .update(updates)
    .eq("id", id)
    .select("id, name, config_json, is_shared, locked_method_version, updated_at")
    .single();

  if (error) {
    console.error("[portfolio_views] update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(view);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "View id required" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("portfolio_views")
    .select("id, created_by")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  if ((existing as { created_by: string }).created_by !== user.id) {
    return NextResponse.json({ error: "Only the creator can delete this view" }, { status: 403 });
  }

  const { error } = await supabase.from("portfolio_views").delete().eq("id", id);

  if (error) {
    console.error("[portfolio_views] delete error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
