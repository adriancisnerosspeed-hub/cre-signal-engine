import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { logOverrideCreated } from "@/lib/eventLog";
import { NextResponse } from "next/server";

/**
 * POST /api/policy-overrides
 * Create a policy override for a deal. PRO+ or ENTERPRISE only; org OWNER/ADMIN only.
 * Writes to policy_overrides (user client) and governance_decision_log (service role).
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

  let body: { deal_id?: string; policy_id?: string; snapshot_id?: string | null; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const dealId = typeof body.deal_id === "string" ? body.deal_id.trim() : null;
  const policyId = typeof body.policy_id === "string" ? body.policy_id.trim() : null;
  if (!dealId || !policyId) {
    return NextResponse.json(
      { error: "deal_id and policy_id are required", code: "MISSING_IDS" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();
  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUseTrajectory) {
    return NextResponse.json(
      {
        error: "Policy overrides require Analyst, Fund, or Enterprise plan.",
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        required_plan: "PRO+",
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
      { error: "Only workspace owners and admins can create overrides.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("id, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!deal) {
    return NextResponse.json({ error: "Deal not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: policy } = await service
    .from("risk_policies")
    .select("id, organization_id")
    .eq("id", policyId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!policy) {
    return NextResponse.json({ error: "Policy not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const snapshotId =
    body.snapshot_id === null || body.snapshot_id === undefined
      ? null
      : typeof body.snapshot_id === "string"
        ? body.snapshot_id.trim() || null
        : null;
  const reason =
    body.reason === null || body.reason === undefined
      ? null
      : typeof body.reason === "string"
        ? body.reason.trim() || null
        : null;

  const insertRow = {
    deal_id: dealId,
    policy_id: policyId,
    snapshot_id: snapshotId,
    reason,
    user_id: user.id,
  };

  const { data: existing } = await supabase
    .from("policy_overrides")
    .select("id, deal_id, policy_id, snapshot_id, reason, user_id, created_at")
    .eq("deal_id", dealId)
    .eq("policy_id", policyId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const { data: override, error: insertError } = await supabase
    .from("policy_overrides")
    .insert(insertRow)
    .select("id, deal_id, policy_id, snapshot_id, reason, user_id, created_at")
    .single();

  if (insertError) {
    console.error("[policy-overrides] insert error", insertError);
    return NextResponse.json({ error: insertError.message, code: "INSERT_FAILED" }, { status: 500 });
  }

  const { error: logError } = await service.from("governance_decision_log").insert({
    organization_id: orgId,
    deal_id: dealId,
    policy_id: policyId,
    snapshot_id: snapshotId,
    action_type: "override",
    note: reason,
    user_id: user.id,
  });

  if (logError) {
    console.error("[policy-overrides] governance_decision_log insert failed (override still created):", logError);
  }

  logOverrideCreated({ org_id: orgId, user_id: user.id, deal_id: dealId, policy_id: policyId });

  return NextResponse.json(override, { status: 201 });
}
