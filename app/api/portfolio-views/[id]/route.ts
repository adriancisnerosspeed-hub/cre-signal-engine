import { createClient } from "@/lib/supabase/server";
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
    return NextResponse.json({ error: "Only the creator can edit this view" }, { status: 403 });
  }

  let body: { name?: string; config_json?: Record<string, unknown>; is_shared?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (body.config_json && typeof body.config_json === "object") updates.config_json = body.config_json;
  if (typeof body.is_shared === "boolean") updates.is_shared = body.is_shared;

  const { data: view, error } = await supabase
    .from("portfolio_views")
    .update(updates)
    .eq("id", id)
    .select("id, name, config_json, is_shared, updated_at")
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
