import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

export async function GET() {
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

  const { data: views, error } = await supabase
    .from("portfolio_views")
    .select("id, name, config_json, is_shared, created_by, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[portfolio_views] list error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(views ?? []);
}

export async function POST(request: Request) {
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

  let body: { name?: string; config_json?: Record<string, unknown>; is_shared?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "Untitled view";
  const config_json = body.config_json && typeof body.config_json === "object" ? body.config_json : {};
  const is_shared = Boolean(body.is_shared);

  const { data: view, error } = await supabase
    .from("portfolio_views")
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: name || "Untitled view",
      config_json,
      is_shared,
    })
    .select("id, name, config_json, is_shared, created_at")
    .single();

  if (error) {
    console.error("[portfolio_views] create error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(view);
}
