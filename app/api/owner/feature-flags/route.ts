import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/ownerAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { clearFeatureFlagCache } from "@/lib/featureFlags";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const service = createServiceRoleClient();
  const { data, error } = await service.from("feature_flags").select("*").order("name", { ascending: true });

  if (error) {
    console.error("[owner/feature-flags GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flags: data ?? [] });
}

export async function POST(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: { name?: string; enabled?: boolean; description?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("feature_flags")
    .insert({
      name,
      enabled: body.enabled === true,
      description: typeof body.description === "string" ? body.description : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[owner/feature-flags POST]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  clearFeatureFlagCache();
  return NextResponse.json({ flag: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: { id?: string; name?: string; enabled?: boolean; description?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.description !== undefined) {
    patch.description = body.description === null ? null : String(body.description);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.from("feature_flags").update(patch).eq("id", id).select("*").maybeSingle();

  if (error) {
    console.error("[owner/feature-flags PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  clearFeatureFlagCache();
  return NextResponse.json({ flag: data });
}

export async function DELETE(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("feature_flags").delete().eq("id", id);

  if (error) {
    console.error("[owner/feature-flags DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  clearFeatureFlagCache();
  return NextResponse.json({ ok: true });
}
