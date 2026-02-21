import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDefaultPreferences } from "@/lib/digest";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getUsageToday } from "@/lib/usage";
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
      </div>

      <BillingCard
        plan={entitlements.plan}
        analyzeCallsToday={usage.analyze_calls}
        analyzeLimit={entitlements.analyze_calls_per_day}
        digestScheduledEnabled={entitlements.digest_scheduled}
      />

      <SettingsForm initialPreferences={initialPreferences} />
    </main>
  );
}
