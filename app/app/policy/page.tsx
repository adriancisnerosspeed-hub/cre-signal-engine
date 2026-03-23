import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect } from "next/navigation";
import { PolicyClient } from "./PolicyClient";

export type PolicyRow = {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_shared: boolean;
  severity_threshold: string;
  rules_json: unknown;
  created_at: string;
  updated_at: string;
};

export default async function PolicyPage() {
  const supabase = await createClient();
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

  const { data: policies, error } = await supabase
    .from("risk_policies")
    .select("id, organization_id, created_by, name, description, is_enabled, is_shared, severity_threshold, rules_json, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <main className="max-w-[800px] mx-auto p-6">
        <p className="text-red-400">Failed to load policies.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[960px] mx-auto p-6">
      <PolicyClient initialPolicies={(policies ?? []) as PolicyRow[]} />
    </main>
  );
}
