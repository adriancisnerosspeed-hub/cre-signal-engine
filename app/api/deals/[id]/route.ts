import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { normalizeMarket } from "@/lib/normalizeMarket";
import { NextResponse } from "next/server";

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

  const { error: deleteError } = await supabase
    .from("deals")
    .delete()
    .eq("id", dealId)
    .eq("organization_id", orgId);

  if (deleteError) {
    console.error("[deals] delete error", deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const IC_STATUS_VALUES = ["PRE_IC", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"] as const;
const MARKET_MAX_LENGTH = 120;

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
    name?: string;
    asset_type?: string | null;
    market?: string | null;
    city?: string | null;
    state?: string | null;
    raw_text?: string | null;
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

  // Editable base deal fields used by deal setup flow.
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    updates.name = name || "Untitled deal";
  }
  if (body.asset_type !== undefined) {
    updates.asset_type =
      body.asset_type === null || body.asset_type === "" ? null : String(body.asset_type).trim();
  }
  if (body.market !== undefined || body.city !== undefined || body.state !== undefined) {
    const rawMarket = typeof body.market === "string" ? body.market.trim() || null : null;
    const rawCity = typeof body.city === "string" ? body.city.trim() || null : null;
    const rawState = typeof body.state === "string" ? body.state.trim() || null : null;
    const norm = normalizeMarket({
      city: rawCity,
      state: rawState,
      market: rawMarket,
    });
    updates.market = norm.market_label ? norm.market_label.slice(0, MARKET_MAX_LENGTH) : null;
    updates.city = norm.city ?? null;
    updates.state = norm.state ?? null;
    updates.market_key = norm.market_key ?? null;
    updates.market_label = norm.market_label ?? null;
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

  if (body.raw_text !== undefined) {
    const rawText =
      body.raw_text === null || body.raw_text === "" ? null : String(body.raw_text).trim() || null;
    const { error: inputError } = await supabase.from("deal_inputs").insert({
      deal_id: dealId,
      raw_text: rawText,
    });
    if (inputError) {
      console.error("[deals] update input error", inputError);
      return NextResponse.json({ error: inputError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
