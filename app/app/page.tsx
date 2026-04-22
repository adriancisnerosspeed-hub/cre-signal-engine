import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsageBanner from "./UsageBanner";
import OnboardingFlow from "./components/OnboardingFlow";

type Signal = {
  id: number;
  idx: number;
  signal_type: string;
  action: string;
  confidence: string;
  what_changed: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  created_at: string;
};

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);

  let canInviteMembers = false;
  if (orgId) {
    const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(supabase, orgId, user.id);
    canInviteMembers = entitlements.canInviteMembers;
  }

  // Fetch onboarding state + demo deal for onboarding modal
  let showOnboarding = false;
  let demoInfo: { dealId: string; dealName: string; riskScore: number | null; riskBand: string | null } | null = null;

  if (orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("onboarding_completed")
      .eq("id", orgId)
      .maybeSingle();

    if (org && !(org as { onboarding_completed?: boolean }).onboarding_completed) {
      showOnboarding = true;
      const { data: demoDeal } = await supabase
        .from("deals")
        .select("id, name, latest_risk_score, latest_risk_band")
        .eq("organization_id", orgId)
        .eq("is_demo", true)
        .maybeSingle();

      if (demoDeal) {
        const dd = demoDeal as { id: string; name: string; latest_risk_score: number | null; latest_risk_band: string | null };
        demoInfo = {
          dealId: dd.id,
          dealName: dd.name,
          riskScore: dd.latest_risk_score,
          riskBand: dd.latest_risk_band,
        };
      }
    }
  }

  // Fetch stats for quick summary
  let dealCount = 0;
  let recentScanCount = 0;
  if (orgId) {
    const { count: dc } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    dealCount = dc ?? 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: sc } = await supabase
      .from("deal_scans")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "completed")
      .gte("created_at", thirtyDaysAgo);
    recentScanCount = sc ?? 0;
  }

  const { data: signals, error } = await supabase
    .from("signals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching signals:", error);
  }

  return (
    <main className="max-w-[1000px] mx-auto p-6 bg-background text-foreground">
      {showOnboarding && (
        <OnboardingFlow demo={demoInfo} canInviteMembers={canInviteMembers} />
      )}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Signed in as <strong className="text-foreground">{user.email}</strong>
        </p>
      </div>

      <UsageBanner />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Deals</div>
          <div className="text-2xl font-bold text-foreground">{dealCount}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Scans (30d)</div>
          <div className="text-2xl font-bold text-foreground">{recentScanCount}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Signals</div>
          <div className="text-2xl font-bold text-foreground">{signals?.length ?? 0}</div>
        </div>
        <Link href="/analyze" className="p-4 bg-card border border-border rounded-lg no-underline hover:border-blue-500/50 transition-colors group">
          <div className="text-xs text-muted-foreground mb-1">Quick action</div>
          <div className="text-sm font-semibold text-blue-500 group-hover:text-blue-400">Run Analysis →</div>
        </Link>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Link href="/app/deals/new" className="p-3 bg-card border border-border rounded-lg no-underline hover:border-foreground/20 transition-colors text-center">
          <div className="text-sm font-medium text-foreground">New Deal</div>
        </Link>
        <Link href="/app/deals" className="p-3 bg-card border border-border rounded-lg no-underline hover:border-foreground/20 transition-colors text-center">
          <div className="text-sm font-medium text-foreground">All Deals</div>
        </Link>
        <Link href="/app/portfolio" className="p-3 bg-card border border-border rounded-lg no-underline hover:border-foreground/20 transition-colors text-center">
          <div className="text-sm font-medium text-foreground">Portfolio</div>
        </Link>
        <Link href="/app/governance/dashboard" className="p-3 bg-card border border-border rounded-lg no-underline hover:border-foreground/20 transition-colors text-center">
          <div className="text-sm font-medium text-foreground">Governance</div>
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-foreground mb-4 border-l-2 border-blue-500 pl-3">
        Recent Signals ({signals?.length || 0})
      </h2>

      {!signals || signals.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground mb-2">No signals yet.</p>
          <p className="text-sm text-muted-foreground/70">
            Use the <Link href="/analyze" className="text-blue-500 underline underline-offset-2">analyze</Link> feature to generate CRE market signals.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {signals.map((signal: Signal) => {
            const actionVars =
              signal.action === "Act"
                ? { bg: "var(--badge-act-bg)", color: "var(--badge-act-fg)" }
                : signal.action === "Monitor"
                  ? { bg: "var(--badge-monitor-bg)", color: "var(--badge-monitor-fg)" }
                  : { bg: "var(--badge-default-bg)", color: "var(--badge-default-fg)" };
            const conf = (signal.confidence || "").toLowerCase();
            const confidenceVars =
              conf === "high"
                ? { bg: "var(--badge-conf-high-bg)", color: "var(--badge-conf-high-fg)" }
                : conf === "medium"
                  ? { bg: "var(--badge-conf-med-bg)", color: "var(--badge-conf-med-fg)" }
                  : { bg: "var(--badge-conf-low-bg)", color: "var(--badge-conf-low-fg)" };
            return (
              <div
                key={signal.id}
                className="signal-card rounded-lg p-3.5 cursor-pointer bg-card border border-border shadow-sm hover:border-foreground/20 transition-colors"
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-block py-1 px-2 rounded text-[11px] font-semibold bg-muted text-muted-foreground">
                      {signal.signal_type}
                    </span>
                    <span
                      className="inline-block py-1 px-2 rounded text-[11px] font-semibold"
                      style={{ backgroundColor: actionVars.bg, color: actionVars.color }}
                    >
                      {signal.action}
                    </span>
                    <span
                      className="inline-block py-1 px-2 rounded text-[11px] font-medium"
                      style={{ backgroundColor: confidenceVars.bg, color: confidenceVars.color }}
                    >
                      {signal.confidence}
                    </span>
                  </div>
                  <time
                    className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap"
                    dateTime={signal.created_at}
                  >
                    {new Date(signal.created_at).toLocaleString()}
                  </time>
                </div>

                {signal.what_changed && (
                  <div className="mb-2.5 pb-2.5 border-b border-border">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      What Changed
                    </div>
                    <p className="m-0 text-sm leading-relaxed text-foreground">
                      {signal.what_changed}
                    </p>
                  </div>
                )}

                {signal.why_it_matters && (
                  <div className="mb-2.5 pb-2.5 border-b border-border">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Why It Matters
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                      {signal.why_it_matters}
                    </p>
                  </div>
                )}

                {signal.who_this_affects && (
                  <div>
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Who This Affects
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                      {signal.who_this_affects}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
