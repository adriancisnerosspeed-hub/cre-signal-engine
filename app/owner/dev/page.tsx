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

  const [orgsRes, leadsRes, scansRes, profilesRes, recentLeadsRes, orgSampleRes, profilesSampleRes] =
    await Promise.all([
      service.from("organizations").select("id", { count: "exact", head: true }),
      service.from("leads").select("id", { count: "exact", head: true }),
      service.from("deal_scans").select("id", { count: "exact", head: true }),
      service.from("profiles").select("id", { count: "exact", head: true }),
      service.from("leads").select("id, email, name, source, created_at").order("created_at", { ascending: false }).limit(12),
      service.from("organizations").select("id, plan, created_at").order("created_at", { ascending: false }).limit(30),
      service.from("profiles").select("id, role, total_full_scans_used").order("id", { ascending: true }).limit(15),
    ]);

  const stats = {
    organizationCount: orgsRes.count ?? 0,
    leadCount: leadsRes.count ?? 0,
    dealScanCount: scansRes.count ?? 0,
    profileCount: profilesRes.count ?? 0,
    recentLeads: recentLeadsRes.data ?? [],
    organizations: orgSampleRes.data ?? [],
    profileSamples: profilesSampleRes.data ?? [],
  };

  return <OwnerDevDashboard stats={stats} ownerEmail={user.email ?? ""} />;
}
