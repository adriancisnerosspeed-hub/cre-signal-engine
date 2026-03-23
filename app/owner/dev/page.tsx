import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isOwner } from "@/lib/auth";
import { OwnerDevDashboard } from "./OwnerDevDashboard";

export default async function OwnerDevPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwner(user.email)) {
    redirect("/app");
  }

  const service = createServiceRoleClient();

  const [orgsRes, leadsRes, scansRes, profilesRes, recentLeadsRes, orgSampleRes, profilesSampleRes, allOrgsRes, allProfilesRes, orgMembersRes] =
    await Promise.all([
      service.from("organizations").select("id", { count: "exact", head: true }),
      service.from("leads").select("id", { count: "exact", head: true }),
      service.from("deal_scans").select("id", { count: "exact", head: true }),
      service.from("profiles").select("id", { count: "exact", head: true }),
      service.from("leads").select("id, email, name, source, created_at").order("created_at", { ascending: false }).limit(12),
      service.from("organizations").select("id, plan, created_at").order("created_at", { ascending: false }).limit(30),
      service.from("profiles").select("id, role, total_full_scans_used").order("id", { ascending: true }).limit(15),
      service.from("organizations").select("id, name, plan, billing_status, created_at, created_by, onboarding_completed").order("created_at", { ascending: false }),
      service.from("profiles").select("id, role, current_org_id, total_full_scans_used, created_at").order("created_at", { ascending: false }),
      service.from("organization_members").select("org_id, user_id, role"),
    ]);

  // Fetch auth user emails for all profiles
  const profileList = allProfilesRes.data ?? [];
  const authUserMap: Record<string, string> = {};
  try {
    const { data: authData } = await service.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authData?.users ?? []) {
      authUserMap[u.id] = u.email ?? "";
    }
  } catch {
    // Graceful fallback if auth admin API fails
  }

  const allOrgs = (allOrgsRes.data ?? []).map((org) => {
    const members = (orgMembersRes.data ?? []).filter((m) => m.org_id === org.id);
    const creatorEmail = authUserMap[org.created_by] ?? null;
    return { ...org, member_count: members.length, creator_email: creatorEmail };
  });

  const allProfiles = profileList.map((p) => {
    const email = authUserMap[p.id] ?? null;
    const orgMemberships = (orgMembersRes.data ?? []).filter((m) => m.user_id === p.id);
    return { ...p, email, org_count: orgMemberships.length };
  });

  const stats = {
    organizationCount: orgsRes.count ?? 0,
    leadCount: leadsRes.count ?? 0,
    dealScanCount: scansRes.count ?? 0,
    profileCount: profilesRes.count ?? 0,
    recentLeads: recentLeadsRes.data ?? [],
    organizations: orgSampleRes.data ?? [],
    profileSamples: profilesSampleRes.data ?? [],
    allOrganizations: allOrgs,
    allProfiles: allProfiles,
  };

  return <OwnerDevDashboard stats={stats} ownerEmail={user.email ?? ""} />;
}
