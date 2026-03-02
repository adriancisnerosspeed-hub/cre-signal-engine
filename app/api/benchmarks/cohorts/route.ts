import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { computeRuleHash, validateRule } from "@/lib/benchmark/cohortRule";
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

  let query = supabase
    .from("benchmark_cohorts")
    .select("id, key, name, description, scope, status, version, rule_hash")
    .in("scope", ["GLOBAL", "SYSTEM"]);

  const { data: workspaceCohorts } = await supabase
    .from("benchmark_cohorts")
    .select("id, key, name, description, scope, status, version, rule_hash")
    .eq("scope", "WORKSPACE")
    .eq("workspace_id", orgId);

  const { data: globalCohorts } = await query;

  const list = [
    ...(globalCohorts ?? []),
    ...(workspaceCohorts ?? []),
  ] as { id: string; key: string; scope: string }[];

  const scopeOrder = (s: string) => (s === "SYSTEM" ? 0 : s === "GLOBAL" ? 1 : 2);
  list.sort((a, b) => {
    const diff = scopeOrder(a.scope) - scopeOrder(b.scope);
    return diff !== 0 ? diff : a.key.localeCompare(b.key, "en");
  });

  return NextResponse.json(list);
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

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canCreateCohort) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.ENTERPRISE_REQUIRED,
        message: "Cohort creation requires Enterprise plan.",
        required_plan: "ENTERPRISE",
      },
      { status: 403 }
    );
  }

  let body: {
    key?: string;
    name?: string;
    description?: string | null;
    scope?: "GLOBAL" | "WORKSPACE" | "SYSTEM";
    rule_json?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!key || !name) {
    return NextResponse.json({ error: "key and name are required" }, { status: 400 });
  }

  const scope = body.scope ?? "WORKSPACE";
  if (!["GLOBAL", "WORKSPACE", "SYSTEM"].includes(scope)) {
    return NextResponse.json({ error: "scope must be GLOBAL, WORKSPACE, or SYSTEM" }, { status: 400 });
  }

  const ruleJson = body.rule_json ?? {};
  const rule = validateRule(ruleJson);
  if (!rule) {
    return NextResponse.json({ error: "rule_json is invalid" }, { status: 400 });
  }

  const ruleHash = computeRuleHash(ruleJson);
  const workspaceId = scope === "WORKSPACE" ? orgId : null;
  const description =
    body.description === null || body.description === undefined
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null;

  const { data: cohort, error } = await supabase
    .from("benchmark_cohorts")
    .insert({
      key,
      name,
      description,
      scope,
      workspace_id: workspaceId,
      rule_json: ruleJson,
      status: "ACTIVE",
      version: 1,
      rule_hash: ruleHash,
      created_by_user_id: user.id,
    })
    .select("id, key, name, description, scope, status, version, rule_hash")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Cohort key already exists" }, { status: 409 });
    }
    console.error("[benchmarks/cohorts] create error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(cohort);
}
