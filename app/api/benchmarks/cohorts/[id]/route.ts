import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { computeRuleHash, validateRule } from "@/lib/benchmark/cohortRule";
import { logCohortUpdated } from "@/lib/eventLog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * PATCH /api/benchmarks/cohorts/[id]
 * Update cohort (rule_json, name, description). Enterprise only; OWNER/ADMIN only.
 * Bumps version and appends to benchmark_cohort_audit when rule_json changes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: cohortId } = await params;
  if (!cohortId) {
    return NextResponse.json({ error: "Cohort id required", code: "MISSING_ID" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canCreateCohort) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.ENTERPRISE_REQUIRED,
        message: "Cohort edit requires Enterprise plan.",
        required_plan: "ENTERPRISE",
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
      { error: "Only workspace owners and admins can edit cohorts.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { data: cohort } = await service
    .from("benchmark_cohorts")
    .select("id, workspace_id, scope, rule_json, rule_hash, version")
    .eq("id", cohortId)
    .maybeSingle();

  if (!cohort) {
    return NextResponse.json({ error: "Cohort not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const c = cohort as { workspace_id: string | null; scope: string };
  const canEdit =
    c.scope === "GLOBAL" ||
    c.scope === "SYSTEM" ||
    (c.scope === "WORKSPACE" && c.workspace_id === orgId);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  let body: { name?: string; description?: string | null; rule_json?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name cannot be empty", code: "INVALID_NAME" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description =
      body.description === null || body.description === ""
        ? null
        : typeof body.description === "string"
          ? body.description.trim() || null
          : null;
  }

  let newRuleJson = (cohort as { rule_json: unknown }).rule_json;
  let newRuleHash = (cohort as { rule_hash: string | null }).rule_hash;
  let newVersion = (cohort as { version: number }).version;

  if (body.rule_json !== undefined) {
    const rule = validateRule(body.rule_json);
    if (!rule) {
      return NextResponse.json({ error: "rule_json is invalid", code: "INVALID_RULE" }, { status: 400 });
    }
    newRuleJson = body.rule_json;
    newRuleHash = computeRuleHash(body.rule_json);
    newVersion = (cohort as { version: number }).version + 1;
    updates.rule_json = newRuleJson;
    updates.rule_hash = newRuleHash;
    updates.version = newVersion;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update", code: "NO_UPDATE" }, { status: 400 });
  }

  const previousRuleJson = (cohort as { rule_json: unknown }).rule_json;
  const previousRuleHash = (cohort as { rule_hash: string | null }).rule_hash;

  const { error: updateError } = await supabase
    .from("benchmark_cohorts")
    .update(updates)
    .eq("id", cohortId);

  if (updateError) {
    console.error("[benchmarks/cohorts] update error", updateError);
    return NextResponse.json({ error: updateError.message, code: "UPDATE_FAILED" }, { status: 500 });
  }

  if (body.rule_json !== undefined && previousRuleJson !== undefined) {
    const { error: auditError } = await service.from("benchmark_cohort_audit").insert({
      cohort_id: cohortId,
      changed_by: user.id,
      previous_rule_json: previousRuleJson,
      new_rule_json: newRuleJson,
      previous_rule_hash: previousRuleHash,
      new_rule_hash: newRuleHash,
    });
    if (auditError) {
      console.warn("[benchmarks/cohorts] benchmark_cohort_audit insert failed (cohort updated):", auditError);
    }
    logCohortUpdated({ org_id: orgId, user_id: user.id, cohort_id: cohortId });
  }

  const { data: updated } = await supabase
    .from("benchmark_cohorts")
    .select("id, key, name, description, scope, status, version, rule_hash")
    .eq("id", cohortId)
    .single();

  return NextResponse.json(updated ?? {});
}
