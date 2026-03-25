import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlements } from "@/lib/entitlements/workspace";
import ChangelogBanner from "@/app/components/ChangelogBanner";
import TrialBanner from "@/app/components/TrialBanner";

export default async function AppSectionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Changelog banner
  const { data: latest } = await supabase
    .from("changelog_entries")
    .select("id, title, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const entry = latest as { id: string; title: string; published_at: string } | null;

  // Trial banner
  let trialInfo = { isTrialing: false, trialDaysRemaining: null as number | null, trialExpired: false };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const orgId = await getCurrentOrgId(supabase, user);
    if (orgId) {
      const service = createServiceRoleClient();
      const { trial } = await getWorkspacePlanAndEntitlements(service, orgId);
      trialInfo = {
        isTrialing: trial.isTrialing,
        trialDaysRemaining: trial.trialDaysRemaining,
        trialExpired: trial.trialExpired,
      };
    }
  }

  return (
    <>
      <TrialBanner
        isTrialing={trialInfo.isTrialing}
        trialDaysRemaining={trialInfo.trialDaysRemaining}
        trialExpired={trialInfo.trialExpired}
      />
      {children}
      <ChangelogBanner entry={entry} />
    </>
  );
}
