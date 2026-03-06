import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
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
      const { data: demoDeal } = await supabase
        .from("deals")
        .select("id, name, latest_risk_score, latest_risk_band")
        .eq("organization_id", orgId)
        .eq("is_demo", true)
        .maybeSingle();

      if (demoDeal) {
        showOnboarding = true;
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
    <main className="max-w-[1000px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      {showOnboarding && <OnboardingFlow demo={demoInfo} />}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Signed in as <strong className="text-gray-900 dark:text-zinc-200">{user.email}</strong>
        </p>
      </div>

      <UsageBanner />

      <div style={{ marginBottom: 24 }}>
        <Link
          href="/analyze"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            textDecoration: "none",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          Go to Analyze
        </Link>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-200 mb-4">
        Recent Signals ({signals?.length || 0})
      </h2>

      {!signals || signals.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 py-6 text-center">
          No signals yet. Use the analyze API to create signals.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {signals.map((signal: Signal) => {
            const actionStyles =
              signal.action === "Act"
                ? { bg: "#3d2e1f", color: "#e5c078" }
                : signal.action === "Monitor"
                  ? { bg: "#2d2d32", color: "#b8b8be" }
                  : { bg: "#1e3329", color: "#7cb89a" };
            const conf = (signal.confidence || "").toLowerCase();
            const confidenceStyles =
              conf === "high"
                ? { bg: "#1e3329", color: "#7cb89a" }
                : conf === "medium"
                  ? { bg: "#3d2e1f", color: "#e5c078" }
                  : { bg: "#2d2d32", color: "#8b8b92" };
            return (
              <div
                key={signal.id}
                className="signal-card rounded-lg p-3.5 cursor-pointer bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 shadow-sm dark:shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-block py-1 px-2 rounded text-[11px] font-semibold bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300"
                    >
                      {signal.signal_type}
                    </span>
                    <span
                      className="inline-block py-1 px-2 rounded text-[11px] font-semibold"
                      style={{ backgroundColor: actionStyles.bg, color: actionStyles.color }}
                    >
                      {signal.action}
                    </span>
                    <span
                      className="inline-block py-1 px-2 rounded text-[11px] font-medium"
                      style={{ backgroundColor: confidenceStyles.bg, color: confidenceStyles.color }}
                    >
                      {signal.confidence}
                    </span>
                  </div>
                  <time
                    className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0 whitespace-nowrap"
                    dateTime={signal.created_at}
                  >
                    {new Date(signal.created_at).toLocaleString()}
                  </time>
                </div>

                {signal.what_changed && (
                  <div className="mb-2.5 pb-2.5 border-b border-gray-200 dark:border-zinc-700">
                    <div className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
                      What Changed
                    </div>
                    <p className="m-0 text-sm leading-relaxed text-gray-900 dark:text-zinc-200">
                      {signal.what_changed}
                    </p>
                  </div>
                )}

                {signal.why_it_matters && (
                  <div className="mb-2.5 pb-2.5 border-b border-gray-200 dark:border-zinc-700">
                    <div className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
                      Why It Matters
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
                      {signal.why_it_matters}
                    </p>
                  </div>
                )}

                {signal.who_this_affects && (
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
                      Who This Affects
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
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
