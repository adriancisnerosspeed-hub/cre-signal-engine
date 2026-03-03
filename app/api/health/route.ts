import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { NextResponse } from "next/server";
import { RISK_INDEX_VERSION } from "@/lib/riskIndex";

export const runtime = "nodejs";

/**
 * Health check. Public: { ok: true } only.
 * Authenticated: detailed payload (database_ok, stripe_configured, workspace_plan, latest_method_version)
 * only for platform_admin OR workspace OWNER; regular MEMBER gets { ok: true } only.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const platformPlan = await getPlanForUser(supabase, user.id);
  const isPlatformAdmin = platformPlan === "platform_admin";

  let isOwner = false;
  if (!isPlatformAdmin) {
    const orgId = await getCurrentOrgId(supabase, user);
    if (orgId) {
      const service = createServiceRoleClient();
      const { data: member } = await service
        .from("organization_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      isOwner = (member as { role?: string } | null)?.role === "OWNER";
    }
  }

  if (!isPlatformAdmin && !isOwner) {
    return NextResponse.json({ ok: true });
  }

  let database_ok = false;
  let stripe_configured = false;
  let workspace_plan: string | undefined;

  try {
    const service = createServiceRoleClient();
    const { data } = await service.from("organizations").select("id").limit(1).maybeSingle();
    database_ok = !!data || data === null;
  } catch {
    database_ok = false;
  }

  stripe_configured = !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY.trim().length > 0
  );

  try {
    const service = createServiceRoleClient();
    const orgId = await getCurrentOrgId(supabase, user);
    if (orgId) {
      const { plan } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
      workspace_plan = plan;
    }
  } catch {
    // leave workspace_plan undefined
  }

  return NextResponse.json({
    ok: true,
    database_ok,
    stripe_configured,
    ...(workspace_plan != null && { workspace_plan }),
    latest_method_version: RISK_INDEX_VERSION,
  });
}
