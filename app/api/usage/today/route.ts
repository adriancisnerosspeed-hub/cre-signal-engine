import { createClient } from "@/lib/supabase/server";
import { getPlanForUser, getEntitlements } from "@/lib/entitlements";
import { getUsageToday } from "@/lib/usage";

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
  const limit = getEntitlements(plan).analyze_calls_per_day;
  const usage = await getUsageToday(supabase, user.id);
  const used = usage.analyze_calls;
  const percent = limit > 0 ? used / limit : 0;

  return Response.json({
    used,
    limit,
    percent,
    plan,
  });
}
