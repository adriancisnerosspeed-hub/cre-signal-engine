import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import ApiTokensClient from "./ApiTokensClient";

export default async function ApiTokensPage() {
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
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#a1a1aa" }}>No workspace selected.</p>
      </main>
    );
  }

  const { plan, entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const { data: member } = await service
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (member as { role?: string } | null)?.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const isEnterprise = plan === "ENTERPRISE";

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings" style={{ color: "#71717a", fontSize: 14, textDecoration: "none", marginBottom: 8, display: "inline-block" }}>
          ← Settings
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>API tokens</h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          {isEnterprise
            ? "Create tokens to access the read-only API (e.g. GET /api/v1/deals/:id/risk, GET /api/v1/portfolio/risk-summary)."
            : "API tokens are available on the Enterprise plan."}
        </p>
      </div>

      {!isEnterprise && (
        <p style={{ padding: 16, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, color: "#fbbf24" }}>
          Upgrade to Enterprise to create API tokens for the v1 read-only API.
        </p>
      )}

      {isEnterprise && canManage && <ApiTokensClient />}
      {isEnterprise && !canManage && (
        <p style={{ color: "#71717a" }}>Only workspace owners and admins can create or revoke API tokens.</p>
      )}
    </main>
  );
}
