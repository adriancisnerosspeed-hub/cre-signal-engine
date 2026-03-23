import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDigestSignals, getDefaultPreferences, prepareDigestSignals, groupSignalsForDigest } from "@/lib/digest";
import { getEntitlementsForUser } from "@/lib/entitlements";
import Link from "next/link";
import DigestPreviewClient from "./DigestPreviewClient";

const WINDOW_HOURS = 24;

export default async function DigestPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: prefsRow } = await supabase
    .from("user_preferences")
    .select("signal_types, actions, min_confidence")
    .eq("user_id", user.id)
    .maybeSingle();

  const defaults = getDefaultPreferences();
  const prefs = prefsRow
    ? {
        signal_types: prefsRow.signal_types ?? defaults.signal_types,
        actions: prefsRow.actions ?? defaults.actions,
        min_confidence: prefsRow.min_confidence ?? defaults.min_confidence,
      }
    : defaults;

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  let rawSignals: Awaited<ReturnType<typeof getDigestSignals>> = [];
  try {
    rawSignals = await getDigestSignals(supabase, {
      userId: user.id,
      windowHours: WINDOW_HOURS,
      prefs,
    });
  } catch {
    // render empty
  }

  const entitlements = await getEntitlementsForUser(supabase, user.id);
  const { signals, additionalCount, dedupeApplied } = prepareDigestSignals(
    rawSignals,
    entitlements.email_digest_max_signals
  );
  const grouped = groupSignalsForDigest(signals);
  const rangeStr = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;

  return (
    <main className="max-w-[720px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-foreground">
          Risk Brief
        </h1>
        <p className="text-muted-foreground mt-1">
          Last 24 hours · {rangeStr}
        </p>
      </div>

      <div className="mb-4">
        <DigestPreviewClient />
      </div>

      {signals.length === 0 ? (
        <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
          <p className="text-muted-foreground m-0">
            No actionable signals in the last 24 hours matching your preferences.
          </p>
          <p className="text-muted-foreground/70 text-[13px] mt-2 mb-0">
            <Link href="/settings" className="text-blue-500">Adjust preferences</Link> or run an analysis to generate signals.
          </p>
        </div>
      ) : (
        <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
          {dedupeApplied && (
            <p className="text-muted-foreground/70 text-xs mb-3">
              Deduped similar signals for readability.
            </p>
          )}
          <p className="text-foreground mb-4 text-sm">
            {signals.length} signal{signals.length !== 1 ? "s" : ""} (same structure as the email)
            {additionalCount > 0 && (
              <span className="text-muted-foreground font-normal">
                {" "}+{additionalCount} more in dashboard
              </span>
            )}
          </p>
          {Array.from(grouped.entries()).map(([signalType, byAction]) => (
            <div key={signalType} className="mb-5">
              <h2 className="text-sm font-semibold text-foreground mb-2">
                {signalType}
              </h2>
              {Array.from(byAction.entries()).map(([action, items]) => (
                <div key={action} className="mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">
                    {action}
                  </h3>
                  <ul className="m-0 pl-5">
                    {items.map((s) => (
                      <li key={s.id} className="mb-2.5">
                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider block mb-1">What changed</span>
                        <p className="m-0 text-[13px] leading-[1.5] text-foreground">{s.what_changed || "—"}</p>
                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider block mb-1 mt-2">Why it matters</span>
                        <p className="m-0 text-[13px] leading-[1.5] text-foreground">{s.why_it_matters || "—"}</p>
                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider block mb-1 mt-2">Who this affects</span>
                        <p className="m-0 text-[13px] leading-[1.5] text-foreground">{s.who_this_affects || "—"}</p>
                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider inline-block mt-1">Confidence: {s.confidence || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6">
        <Link href="/app" className="text-blue-500 text-sm">Back to Dashboard</Link>
      </p>
    </main>
  );
}
