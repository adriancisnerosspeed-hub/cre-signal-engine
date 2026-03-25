import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPlanForUser, getEntitlementsForUser } from "@/lib/entitlements";
import { getUsageToday, getMonthlyScansUsed } from "@/lib/usage";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlements } from "@/lib/entitlements/workspace";

/** GET /api/usage/today — returns today's analyze usage and limit for the current user. Auth required. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getPlanForUser(supabase, user.id);
  const entitlements = await getEntitlementsForUser(supabase, user.id);
  const usage = await getUsageToday(supabase, user.id);

  const analyzeLimit = entitlements.analyze_calls_per_day;
  const analyzeUsed = usage.analyze_calls;
  const analyzePercent = analyzeLimit > 0 ? analyzeUsed / analyzeLimit : 0;

  const dealScansLimit = entitlements.deal_scans_per_day;
  const dealScansUsed = usage.deal_scans;
  const dealScansPercent = dealScansLimit > 0 ? dealScansUsed / dealScansLimit : 0;

  // Monthly scan usage for Starter (PRO) users
  let monthlyScansUsed = 0;
  let monthlyScansLimit: number | null = null;
  const orgId = await getCurrentOrgId(supabase, user);
  if (orgId) {
    const service = createServiceRoleClient();
    const { entitlements: wsEnt } = await getWorkspacePlanAndEntitlements(service, orgId);
    if (wsEnt.maxScansPerMonth !== null) {
      monthlyScansUsed = await getMonthlyScansUsed(service, orgId);
      monthlyScansLimit = wsEnt.maxScansPerMonth;
    }
  }

  return Response.json({
    used: analyzeUsed,
    limit: analyzeLimit,
    percent: analyzePercent,
    plan,
    deal_scans_used: dealScansUsed,
    deal_scans_limit: dealScansLimit,
    percent_deal_scans: dealScansPercent,
    monthly_scans_used: monthlyScansUsed,
    monthly_scans_limit: monthlyScansLimit,
  });
}
