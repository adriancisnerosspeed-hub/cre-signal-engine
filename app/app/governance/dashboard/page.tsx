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
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#a1a1aa" }}>No workspace selected.</p>
      </main>
    );
  }

  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const canView = entitlements.canUseTrajectory || entitlements.canUseGovernanceExport;
  if (!canView) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <Link href="/app" style={{ color: "#71717a", fontSize: 14, textDecoration: "none", marginBottom: 8, display: "inline-block" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>Governance dashboard</h1>
        <p style={{ color: "#a1a1aa", marginTop: 8 }}>
          Available on Analyst and Enterprise plans.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ color: "#71717a", fontSize: 14, textDecoration: "none", marginBottom: 8, display: "inline-block" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
          Governance dashboard
        </h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          Portfolio risk trend, policy violations, and override counts.
        </p>
      </div>
      <GovernanceDashboardClient />
    </main>
  );
}
