import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { parseRules } from "@/lib/policy/validate";
import { NextResponse } from "next/server";

export async function GET(
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

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Policy id required" }, { status: 400 });
  }

  const { data: policy, error } = await supabase
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error || !policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  return NextResponse.json(policy);
}

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

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Policy id required" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("risk_policies")
    .select("id, organization_id, is_enabled")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  let body: {
    name?: string;
    description?: string | null;
    is_enabled?: boolean;
    is_shared?: boolean;
    rules_json?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name) updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description =
      body.description === null || body.description === ""
        ? null
        : typeof body.description === "string"
          ? body.description.trim() || null
          : undefined;
  }
  if (typeof body.is_enabled === "boolean") updates.is_enabled = body.is_enabled;
  if (typeof body.is_shared === "boolean") updates.is_shared = body.is_shared;

  // PRO: only one enabled policy per org; block PATCH that would enable a second
  if (updates.is_enabled === true) {
    const currentlyEnabled = (existing as { is_enabled?: boolean }).is_enabled;
    if (!currentlyEnabled) {
      const service = createServiceRoleClient();
      const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
      if (entitlements.maxActivePoliciesPerOrg != null) {
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
    }
  }

  if (body.rules_json !== undefined) {
    if (!Array.isArray(body.rules_json)) {
      return NextResponse.json({ error: "rules_json must be an array" }, { status: 400 });
    }
    const rules = parseRules(body.rules_json);
    if (rules === null) {
      return NextResponse.json({ error: "rules_json contains invalid rule(s)" }, { status: 400 });
    }
    updates.rules_json = body.rules_json;
  }

  if (Object.keys(updates).length === 0) {
    const { data: current } = await supabase
      .from("risk_policies")
      .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
      .eq("id", id)
      .single();
    return NextResponse.json(current);
  }

  const { data: policy, error } = await supabase
    .from("risk_policies")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .single();

  if (error) {
    console.error("[risk-policies] update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(policy);
}

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

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Policy id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("risk_policies")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) {
    console.error("[risk-policies] delete error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
