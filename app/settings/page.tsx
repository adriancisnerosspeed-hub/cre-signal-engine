import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureProfile } from "@/lib/auth";
import { getDefaultPreferences } from "@/lib/digest";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { getUsageToday } from "@/lib/usage";
import { getCurrentOrg, getCurrentOrgId } from "@/lib/org";
import { version as methodologyVersion } from "@/lib/methodology/methodologyContent";
import SettingsForm from "./SettingsForm";
import BillingCard from "./BillingCard";
import MethodologyDownloadLink from "@/app/components/MethodologyDownloadLink";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(supabase, user);
  const currentOrg = await getCurrentOrg(supabase, user);
  const orgId = await getCurrentOrgId(supabase, user);

  const [entitlements, usage, workspacePlanResult] = await Promise.all([
    getEntitlementsForUser(supabase, user.id),
    getUsageToday(supabase, user.id),
    orgId ? getWorkspacePlanAndEntitlementsForUser(createServiceRoleClient(), orgId, user.id).then((r) => r.plan).catch(() => null) : Promise.resolve(null),
  ]);

  const planForDisplay = workspacePlanResult ?? entitlements.plan;

  const { data: row } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const defaults = getDefaultPreferences();
  const initialPreferences = row
    ? {
        signal_types: row.signal_types ?? defaults.signal_types,
        actions: row.actions ?? defaults.actions,
        min_confidence: row.min_confidence ?? defaults.min_confidence,
        timezone: row.timezone ?? defaults.timezone,
        digest_time_local: row.digest_time_local ?? defaults.digest_time_local,
        digest_enabled: row.digest_enabled ?? defaults.digest_enabled,
      }
    : defaults;

  return (
    <main className="max-w-[1000px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Signed in as <strong className="text-gray-900 dark:text-zinc-200">{user.email}</strong>
        </p>
        <div className="mt-4 py-4 px-5 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/8 rounded-lg max-w-[480px]">
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2.5 font-semibold uppercase tracking-wider">
            Quick links
          </p>
          <ul className="list-none p-0 m-0 text-sm">
            <li className="mb-2.5">
              <Link href="/settings/workspace" className="text-[#3b82f6] no-underline font-medium">
                Workspace — members &amp; invites
              </Link>
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">Manage your workspace and invite team members.</span>
            </li>
            <li className="mb-2.5">
              <Link href="/app/methodology" className="text-[#3b82f6] no-underline font-medium">
                Risk Index Methodology
              </Link>
              {entitlements.scan_export_enabled && (
                <>
                  {" · "}
                  <MethodologyDownloadLink
                    defaultFilename={`cre-signal-risk-index-methodology-v${methodologyVersion}.pdf`}
                  />
                </>
              )}
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">View and download the methodology PDF.</span>
            </li>
            <li className="mb-2.5">
              <Link href="/app/policy" className="text-[#3b82f6] no-underline font-medium">
                Governance
              </Link>
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">Create and manage governance policies and run evaluations.</span>
            </li>
            <li className="mb-2.5">
              <Link href="/app/governance/dashboard" className="text-[#3b82f6] no-underline font-medium">
                Governance dashboard
              </Link>
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">Portfolio risk trend, policy violations, overrides (Analyst / Fund / Enterprise).</span>
            </li>
            <li className="mb-2.5">
              <Link href="/app/benchmarks/cohorts" className="text-[#3b82f6] no-underline font-medium">
                Benchmark cohorts &amp; snapshots
              </Link>
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">View cohorts; Enterprise can create cohorts and build snapshots.</span>
            </li>
            <li>
              <Link href="/settings/api-tokens" className="text-[#3b82f6] no-underline font-medium">
                API tokens
              </Link>
              <span className="text-gray-500 dark:text-zinc-400 ml-1.5">Create tokens for the read-only API (Enterprise only).</span>
            </li>
          </ul>
        </div>
      </div>

      <BillingCard
        plan={planForDisplay}
        analyzeCallsToday={usage.analyze_calls}
        analyzeLimit={entitlements.analyze_calls_per_day}
        dealScansToday={usage.deal_scans}
        dealScansLimit={entitlements.deal_scans_per_day}
        digestScheduledEnabled={entitlements.digest_scheduled}
      />

      {process.env.NODE_ENV === "development" && (
        <section className="mb-6 p-4 border border-dashed border-border rounded-lg bg-muted/30">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">
            [Dev] Workspace
          </h2>
          <p className="text-[13px] text-foreground m-0">
            current_org_id: <code className="bg-muted/50 px-1.5 py-0.5 rounded">{currentOrg?.id ?? "—"}</code>
          </p>
          <p className="text-[13px] text-foreground mt-1 mb-0">
            org name: <strong>{currentOrg?.name ?? "—"}</strong>
          </p>
        </section>
      )}

      <SettingsForm initialPreferences={initialPreferences} />
    </main>
  );
}
