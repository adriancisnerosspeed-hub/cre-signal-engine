import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

export async function GET(
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

  const { data: rows, error } = await supabase
    .from("risk_audit_log")
    .select("deal_id, scan_id, previous_score, new_score, delta, band_change, model_version, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[deals/audit] fetch error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(rows ?? []);
}
