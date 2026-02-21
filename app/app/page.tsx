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
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
          Dashboard
        </h1>
        <p style={{ color: "#a1a1aa", marginTop: 4 }}>
          Signed in as <strong style={{ color: "#e4e4e7" }}>{user.email}</strong>
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

      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 16,
          color: "#e4e4e7",
        }}
      >
        Recent Signals ({signals?.length || 0})
      </h2>

      {!signals || signals.length === 0 ? (
        <p
          style={{
            color: "#a1a1aa",
            padding: 24,
            textAlign: "center",
          }}
        >
          No signals yet. Use the analyze API to create signals.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {signals.map((signal: Signal) => {
            const actionStyles =
              signal.action === "Act"
                ? { bg: "#431407", color: "#fcd34d" }
                : signal.action === "Monitor"
                  ? { bg: "#27272a", color: "#e4e4e7" }
                  : { bg: "#14532d", color: "#86efac" };
            const conf =
              (signal.confidence || "").toLowerCase();
            const confidenceStyles =
              conf === "high"
                ? { bg: "#14532d", color: "#86efac" }
                : conf === "medium"
                  ? { bg: "#431407", color: "#fcd34d" }
                  : { bg: "#3f3f46", color: "#a1a1aa" };
            return (
              <div
                key={signal.id}
                style={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 10,
                  padding: 20,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: "#3f3f46",
                        color: "#d4d4d8",
                      }}
                    >
                      {signal.signal_type}
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: actionStyles.bg,
                        color: actionStyles.color,
                      }}
                    >
                      {signal.action}
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: confidenceStyles.bg,
                        color: confidenceStyles.color,
                      }}
                    >
                      {signal.confidence}
                    </span>
                  </div>
                  <time
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                    dateTime={signal.created_at}
                  >
                    {new Date(signal.created_at).toLocaleString()}
                  </time>
                </div>

                {signal.what_changed && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#e4e4e7",
                        marginBottom: 4,
                      }}
                    >
                      What Changed
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: "#d4d4d8",
                      }}
                    >
                      {signal.what_changed}
                    </p>
                  </div>
                )}

                {signal.why_it_matters && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#e4e4e7",
                        marginBottom: 4,
                      }}
                    >
                      Why It Matters
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: "#d4d4d8",
                      }}
                    >
                      {signal.why_it_matters}
                    </p>
                  </div>
                )}

                {signal.who_this_affects && (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#e4e4e7",
                        marginBottom: 4,
                      }}
                    >
                      Who This Affects
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: "#d4d4d8",
                      }}
                    >
                      {signal.who_this_affects}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
