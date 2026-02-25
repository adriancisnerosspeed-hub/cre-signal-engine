import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import Link from "next/link";
import WorkspaceClient from "./WorkspaceClient";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);
  const entitlements = await getEntitlementsForUser(service, user.id);
  const plan = entitlements.plan;

  if (!orgId) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#a1a1aa" }}>No workspace selected.</p>
      </main>
    );
  }

  const canInvite = entitlements.workspace_invites_enabled;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  const { data: memberRows } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", orgId);

  const members: { user_id: string; role: string; email: string | null }[] = [];
  for (const row of memberRows ?? []) {
    const r = row as { user_id: string; role: string };
    const { data: userData } = await service.auth.admin.getUserById(r.user_id);
    members.push({
      user_id: r.user_id,
      role: r.role,
      email: userData?.user?.email ?? null,
    });
  }

  const myMember = members.find((m) => m.user_id === user.id);
  const canManage = myMember?.role === "owner" || myMember?.role === "admin";

  const { data: invites } = await supabase
    .from("organization_invites")
    .select("id, email, role, expires_at, status")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Settings
        </Link>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Workspace
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
        {(org as { name?: string })?.name ?? "Workspace"}
      </p>
      <p style={{ color: "#71717a", fontSize: 13, marginBottom: 24 }}>
        Plan: <span style={{ fontWeight: 600, color: plan === "pro" || plan === "owner" ? "#22c55e" : "#e4e4e7" }}>{plan === "owner" ? "Pro" : plan === "pro" ? "Pro" : "Free"}</span>
      </p>

      {!canInvite ? (
        <div
          style={{
            padding: 20,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.03)",
            marginBottom: 24,
          }}
        >
          <p style={{ color: "#e4e4e7", marginBottom: 8 }}>
            Workspace collaboration is a Pro feature.
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 12 }}>
            Upgrade to invite team members and share deal scans.
          </p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : null}

      <WorkspaceClient
        members={members}
        invites={(invites ?? []) as { id: string; email: string; role: string; expires_at: string }[]}
        currentUserId={user.id}
        canManage={canManage ?? false}
        canInvite={canInvite}
      />
    </main>
  );
}
