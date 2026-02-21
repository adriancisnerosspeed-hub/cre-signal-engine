import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDigestSignals, getDefaultPreferences, prepareDigestSignals, groupSignalsForDigest } from "@/lib/digest";
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

  const { signals, additionalCount, dedupeApplied } = prepareDigestSignals(rawSignals);
  const grouped = groupSignalsForDigest(signals);
  const rangeStr = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;

  const blockStyle = {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 10,
  };
  const labelStyle = { fontSize: 10, fontWeight: 500, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 };
  const bodyStyle = { margin: 0, fontSize: 13, lineHeight: 1.5, color: "#d4d4d8" };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
          Digest preview
        </h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          Last 24 hours · {rangeStr}
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <DigestPreviewClient />
      </div>

      {signals.length === 0 ? (
        <div style={blockStyle}>
          <p style={{ color: "#a1a1aa", margin: 0 }}>
            No actionable signals in the last 24 hours matching your preferences.
          </p>
          <p style={{ color: "#71717a", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            <Link href="/settings" style={{ color: "#3b82f6" }}>Adjust preferences</Link> or run an analysis to generate signals.
          </p>
        </div>
      ) : (
        <div style={blockStyle}>
          {dedupeApplied && (
            <p style={{ color: "#71717a", fontSize: 12, marginBottom: 12 }}>
              Deduped similar signals for readability.
            </p>
          )}
          <p style={{ color: "#e4e4e7", marginBottom: 16, fontSize: 14 }}>
            {signals.length} signal{signals.length !== 1 ? "s" : ""} (same structure as the email)
            {additionalCount > 0 && (
              <span style={{ color: "#a1a1aa", fontWeight: 400 }}>
                {" "}+{additionalCount} more in dashboard
              </span>
            )}
          </p>
          {Array.from(grouped.entries()).map(([signalType, byAction]) => (
            <div key={signalType} style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", marginBottom: 8 }}>
                {signalType}
              </h2>
              {Array.from(byAction.entries()).map(([action, items]) => (
                <div key={action} style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", marginBottom: 6 }}>
                    {action}
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {items.map((s) => (
                      <li key={s.id} style={{ marginBottom: 10 }}>
                        <span style={labelStyle}>What changed</span>
                        <p style={bodyStyle}>{s.what_changed || "—"}</p>
                        <span style={labelStyle}>Why it matters</span>
                        <p style={bodyStyle}>{s.why_it_matters || "—"}</p>
                        <span style={labelStyle}>Who this affects</span>
                        <p style={bodyStyle}>{s.who_this_affects || "—"}</p>
                        <span style={{ ...labelStyle, display: "inline-block", marginTop: 4 }}>Confidence: {s.confidence || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/app" style={{ color: "#3b82f6", fontSize: 14 }}>Back to Dashboard</Link>
      </p>
    </main>
  );
}
