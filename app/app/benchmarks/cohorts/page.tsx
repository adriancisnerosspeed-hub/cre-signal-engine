import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import BenchmarksCohortsClient from "./BenchmarksCohortsClient";

export default async function BenchmarksCohortsPage() {
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

  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const canCreateCohort = entitlements.canCreateCohort;
  const canBuildSnapshot = entitlements.canBuildSnapshot;

  const { data: globalCohorts } = await supabase
    .from("benchmark_cohorts")
    .select("id, key, name, description, scope, status, version, rule_hash")
    .in("scope", ["GLOBAL", "SYSTEM"]);
  const { data: workspaceCohorts } = await supabase
    .from("benchmark_cohorts")
    .select("id, key, name, description, scope, status, version, rule_hash")
    .eq("scope", "WORKSPACE")
    .eq("workspace_id", orgId);

  const cohorts = [
    ...(globalCohorts ?? []),
    ...(workspaceCohorts ?? []),
  ] as { id: string; key: string; name: string; description: string | null; scope: string; status: string; version: number; rule_hash: string | null }[];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ color: "#71717a", fontSize: 14, textDecoration: "none", marginBottom: 8, display: "inline-block" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
          Benchmark cohorts &amp; snapshots
        </h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          {plan === "ENTERPRISE"
            ? "Create workspace cohorts and build snapshots for benchmarking."
            : "View cohorts. Enterprise plan required to create cohorts and build snapshots."}
        </p>
      </div>

      <BenchmarksCohortsClient
        cohorts={cohorts}
        canCreateCohort={canCreateCohort}
        canBuildSnapshot={canBuildSnapshot}
      />
    </main>
  );
}
