import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { parseRules } from "@/lib/policy/validate";
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

  const { data: policies, error } = await supabase
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[risk-policies] list error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(policies ?? []);
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

  let body: {
    name?: string;
    description?: string | null;
    is_enabled?: boolean;
    is_shared?: boolean;
    severity_threshold?: string;
    rules_json?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const isEnabled = typeof body.is_enabled === "boolean" ? body.is_enabled : true;

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUsePolicy) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        message: "Policy engine is not available on this plan.",
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }
  if (isEnabled && entitlements.maxActivePoliciesPerOrg != null) {
    const { count } = await service
      .from("risk_policies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_enabled", true);
    if ((count ?? 0) >= entitlements.maxActivePoliciesPerOrg) {
      return NextResponse.json(
        {
          code: ENTITLEMENT_ERROR_CODES.POLICY_LIMIT_REACHED,
          message: "Active policy limit reached for this plan (1 per org on PRO).",
          required_plan: "ENTERPRISE",
        },
        { status: 403 }
      );
    }
  }

  const rulesJson = body.rules_json !== undefined ? body.rules_json : [];
  if (!Array.isArray(rulesJson)) {
    return NextResponse.json({ error: "rules_json must be an array" }, { status: 400 });
  }
  const rules = parseRules(rulesJson);
  if (rules === null) {
    return NextResponse.json({ error: "rules_json contains invalid rule(s)" }, { status: 400 });
  }
  const isShared = typeof body.is_shared === "boolean" ? body.is_shared : true;
  const severityThreshold =
    typeof body.severity_threshold === "string" && ["warn", "block"].includes(body.severity_threshold)
      ? body.severity_threshold
      : "warn";
  const description =
    body.description === null || body.description === undefined
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null;

  const { data: policy, error } = await supabase
    .from("risk_policies")
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name,
      description,
      is_enabled: isEnabled,
      is_shared: isShared,
      severity_threshold: severityThreshold,
      rules_json: Array.isArray(rulesJson) ? rulesJson : [],
    })
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .single();

  if (error) {
    console.error("[risk-policies] create error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(policy);
}
