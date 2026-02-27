import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureProfile } from "@/lib/auth";
import { getDefaultPreferences } from "@/lib/digest";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getUsageToday } from "@/lib/usage";
import { getCurrentOrg } from "@/lib/org";
import SettingsForm from "./SettingsForm";
import BillingCard from "./BillingCard";

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

  const [entitlements, usage] = await Promise.all([
    getEntitlementsForUser(supabase, user.id),
    getUsageToday(supabase, user.id),
  ]);

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
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
          Settings
        </h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          Signed in as <strong style={{ color: "#e4e4e7" }}>{user.email}</strong>
        </p>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          <Link href="/settings/workspace" style={{ color: "#a1a1aa" }}>
            Workspace
          </Link>
          {" · "}
          <Link href="/app/methodology" style={{ color: "#a1a1aa" }}>
            Risk Index Methodology
          </Link>
        </p>
      </div>

      <BillingCard
        plan={entitlements.plan}
        analyzeCallsToday={usage.analyze_calls}
        analyzeLimit={entitlements.analyze_calls_per_day}
        dealScansToday={usage.deal_scans}
        dealScansLimit={entitlements.deal_scans_per_day}
        digestScheduledEnabled={entitlements.digest_scheduled}
      />

      {process.env.NODE_ENV === "development" && (
        <section
          style={{
            marginBottom: 24,
            padding: 16,
            border: "1px dashed rgba(255,255,255,0.2)",
            borderRadius: 8,
            backgroundColor: "rgba(0,0,0,0.2)",
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>
            [Dev] Workspace
          </h2>
          <p style={{ fontSize: 13, color: "#e4e4e7", margin: 0 }}>
            current_org_id: <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>{currentOrg?.id ?? "—"}</code>
          </p>
          <p style={{ fontSize: 13, color: "#e4e4e7", margin: "4px 0 0" }}>
            org name: <strong>{currentOrg?.name ?? "—"}</strong>
          </p>
        </section>
      )}

      <SettingsForm initialPreferences={initialPreferences} />
    </main>
  );
}
