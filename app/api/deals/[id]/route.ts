import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

const IC_STATUS_VALUES = ["PRE_IC", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"] as const;

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

  const { id: dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "Deal id required" }, { status: 400 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { data: deal, error: fetchError } = await supabase
    .from("deals")
    .select("id, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (fetchError || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let body: {
    ic_status?: string;
    ic_decision_date?: string | null;
    ic_notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.ic_status !== undefined) {
    if (!IC_STATUS_VALUES.includes(body.ic_status as (typeof IC_STATUS_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid ic_status" }, { status: 400 });
    }
    updates.ic_status = body.ic_status;
  }
  if (body.ic_decision_date !== undefined) {
    updates.ic_decision_date =
      body.ic_decision_date === null || body.ic_decision_date === ""
        ? null
        : body.ic_decision_date;
  }
  if (body.ic_notes !== undefined) {
    updates.ic_notes =
      body.ic_notes === null || body.ic_notes === "" ? null : String(body.ic_notes).trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", dealId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("[deals] update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
