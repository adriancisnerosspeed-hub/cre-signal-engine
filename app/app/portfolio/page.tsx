import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { redirect } from "next/navigation";
import { PortfolioClient } from "./PortfolioClient";

export default async function PortfolioPage() {
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#a1a1aa" }}>No workspace selected.</p>
      </main>
    );
  }

  const plan = await getPlanForUser(service, user.id);
  const summary = await getPortfolioSummary(service, orgId);

  const dealBadges: Record<string, ("unscanned" | "stale" | "needs_review")[]> = {};
  summary.dealBadges.forEach((badges, id) => {
    dealBadges[id] = badges;
  });
  const dealExplainability: Record<
    string,
    { topRiskContributors: { risk_type: string; penalty: number }[]; stabilizers: string[] }
  > = {};
  summary.dealExplainability.forEach((value, id) => {
    dealExplainability[id] = value;
  });

  const savedViews: { id: string; name: string; config_json: Record<string, unknown> }[] = [];
  try {
    const { data: views } = await supabase
      .from("portfolio_views")
      .select("id, name, config_json")
      .eq("organization_id", orgId);
    if (views?.length) {
      for (const v of views as { id: string; name: string; config_json: unknown }[]) {
        savedViews.push({ id: v.id, name: v.name, config_json: (v.config_json as Record<string, unknown>) ?? {} });
      }
    }
  } catch {
    // table may not exist yet or RLS may restrict
  }

  return (
    <main>
      <PortfolioClient
        summary={{
          ...summary,
          dealBadges,
          dealExplainability,
        }}
        isFree={plan === "free"}
        savedViews={savedViews}
      />
    </main>
  );
}
