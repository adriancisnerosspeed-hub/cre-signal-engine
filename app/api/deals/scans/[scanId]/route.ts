import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const plan = await getPlanForUser(service, user.id);

  if (plan === "free") {
    return NextResponse.json(
      { code: "PRO_REQUIRED_FOR_SCENARIO" },
      { status: 403 }
    );
  }

  let body: { scenario_label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const label =
    typeof body.scenario_label === "string"
      ? body.scenario_label.trim()
      : null;
  if (label !== null && label !== "" && label !== "Base" && label !== "Conservative") {
    return NextResponse.json(
      { error: "scenario_label must be Base or Conservative" },
      { status: 400 }
    );
  }

  const { data: scan } = await service
    .from("deal_scans")
    .select("id, deal_id")
    .eq("id", scanId)
    .single();

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { data: deal } = await service
    .from("deals")
    .select("organization_id")
    .eq("id", (scan as { deal_id: string }).deal_id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const orgId = (deal as { organization_id: string }).organization_id;
  const { data: members } = await service
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", user.id);

  if (!members?.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await service
    .from("deal_scans")
    .update({
      scenario_label: label === "" ? null : label,
    })
    .eq("id", scanId);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
