import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import GovernanceDashboardClient from "./GovernanceDashboardClient";

export default async function GovernanceDashboardPage() {
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
      <main className="max-w-[800px] mx-auto p-6">
        <p className="text-muted-foreground">No workspace selected.</p>
      </main>
    );
  }

  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const canView = entitlements.canUseTrajectory || entitlements.canUseGovernanceExport;
  if (!canView) {
    return (
      <main className="max-w-[800px] mx-auto p-6">
        <Link href="/app" className="text-muted-foreground text-sm no-underline hover:text-foreground transition-colors mb-2 inline-block">
          ← Dashboard
        </Link>
        <h1 className="text-[28px] font-bold text-foreground">Governance dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Available on Analyst, Fund, and Enterprise plans.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-[900px] mx-auto p-6">
      <div className="mb-6">
        <Link href="/app" className="text-muted-foreground text-sm no-underline hover:text-foreground transition-colors mb-2 inline-block">
          ← Dashboard
        </Link>
        <h1 className="text-[28px] font-bold text-foreground">
          Governance dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Portfolio risk trend, policy violations, and override counts.
        </p>
      </div>
      <GovernanceDashboardClient />
    </main>
  );
}
