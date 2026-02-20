import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

type Signal = {
  id: number;
  idx: number;
  signal_type: string;
  action: string;
  confidence: string;
  what_changed: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  created_at: string;
};

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(supabase, user);

  const { data: signals, error } = await supabase
    .from("signals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching signals:", error);
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Dashboard</h1>
        <p style={{ color: "var(--foreground)", opacity: 0.8, marginTop: 4 }}>
          Signed in as <strong>{user.email}</strong>
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            textDecoration: "none",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          Go to Analyze
        </Link>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        Recent Signals ({signals?.length || 0})
      </h2>

      {!signals || signals.length === 0 ? (
        <p style={{ color: "#666", padding: 24, textAlign: "center" }}>
          No signals yet. Use the analyze API to create signals.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {signals.map((signal: Signal) => (
            <div
              key={signal.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 16,
                backgroundColor: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  marginBottom: 12,
                }}
              >
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "#e0e0e0",
                      marginRight: 8,
                    }}
                  >
                    {signal.signal_type}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor:
                        signal.action === "Act"
                          ? "#fee"
                          : signal.action === "Monitor"
                          ? "#ffe"
                          : "#efe",
                      color:
                        signal.action === "Act"
                          ? "#c33"
                          : signal.action === "Monitor"
                          ? "#cc3"
                          : "#3c3",
                      marginRight: 8,
                    }}
                  >
                    {signal.action}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      color: "#666",
                    }}
                  >
                    {signal.confidence}
                  </span>
                </div>
                <time
                  style={{ fontSize: 12, color: "#999" }}
                  dateTime={signal.created_at}
                >
                  {new Date(signal.created_at).toLocaleString()}
                </time>
              </div>

              {signal.what_changed && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "#666" }}>
                    What Changed:
                  </strong>
                  <p style={{ marginTop: 4, fontSize: 14 }}>
                    {signal.what_changed}
                  </p>
                </div>
              )}

              {signal.why_it_matters && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "#666" }}>
                    Why It Matters:
                  </strong>
                  <p style={{ marginTop: 4, fontSize: 14 }}>
                    {signal.why_it_matters}
                  </p>
                </div>
              )}

              {signal.who_this_affects && (
                <div>
                  <strong style={{ fontSize: 13, color: "#666" }}>
                    Who This Affects:
                  </strong>
                  <p style={{ marginTop: 4, fontSize: 14 }}>
                    {signal.who_this_affects}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
