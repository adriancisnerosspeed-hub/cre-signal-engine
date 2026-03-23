import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/ownerAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { clearFeatureFlagCache } from "@/lib/featureFlags";

export const runtime = "nodejs";

const PLANS = ["FREE", "PRO", "PRO+", "ENTERPRISE"] as const;
type Plan = (typeof PLANS)[number];

function isPlan(s: string): s is Plan {
  return (PLANS as readonly string[]).includes(s);
}

export async function POST(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: { organization_id?: string; plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const organizationId = typeof body.organization_id === "string" ? body.organization_id.trim() : "";
  const planRaw = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!organizationId || !planRaw) {
    return NextResponse.json({ error: "organization_id and plan are required" }, { status: 400 });
  }

  if (!isPlan(planRaw)) {
    return NextResponse.json({ error: `plan must be one of: ${PLANS.join(", ")}` }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: existing, error: fetchErr } = await service
    .from("organizations")
    .select("id, plan")
    .eq("id", organizationId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { data: updated, error: updateErr } = await service
    .from("organizations")
    .update({ plan: planRaw })
    .eq("id", organizationId)
    .select("id, plan")
    .single();

  if (updateErr) {
    console.error("[owner/tier-override]", updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Invalidate cached server components so entitlements refresh without manual page reload
  clearFeatureFlagCache();
  revalidatePath("/app", "layout");

  return NextResponse.json({
    ok: true,
    previous_plan: (existing as { plan: string }).plan,
    organization: updated,
  });
}
