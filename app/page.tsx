"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function friendlyMessage(res: Response, body: { error?: string; message?: string }): string {
  if (res.status === 401) return "Please sign in to analyze.";
  if (res.status === 429) return "Rate limit reached. Try again later.";
  if (res.status >= 500) return "Something went wrong on our side. Please try again.";
  if (body?.message && typeof body.message === "string") return body.message;
  if (body?.error && typeof body.error === "string") return body.error;
  return "Something went wrong. Please try again.";
}

export default function Home() {
  const [inputs, setInputs] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setIsAuthenticated(!!user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setIsAuthenticated(!!session?.user));
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function run() {
    if (!isAuthenticated) return;
    setLoading(true);
    setOutput("");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(friendlyMessage(res, data));
        return;
      }
      setOutput(typeof data.output === "string" ? data.output : "");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>CRE Signal Engine</h1>
      <p style={{ marginBottom: 16, color: "var(--foreground)", opacity: 0.8 }}>
        Paste your inputs below (each paragraph = one input), then click Analyze.
      </p>

      {isAuthenticated === false && (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 6,
            backgroundColor: "rgba(251,191,36,0.15)",
            border: "1px solid rgba(251,191,36,0.4)",
            color: "var(--foreground)",
            fontSize: 14,
          }}
        >
          Sign in to analyze.
        </div>
      )}

      <textarea
        value={inputs}
        onChange={(e) => setInputs(e.target.value)}
        placeholder="INPUT 1...\n\nINPUT 2...\n\nINPUT 3..."
        style={{
          width: "100%",
          height: 260,
          marginTop: 12,
          padding: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 6,
        }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          onClick={run}
          disabled={loading || !inputs.trim() || isAuthenticated === false}
          style={{
            padding: "10px 14px",
            cursor: isAuthenticated === false || loading ? "not-allowed" : "pointer",
            opacity: isAuthenticated === false || loading ? 0.6 : 1,
            background: "var(--foreground)",
            color: "var(--background)",
            border: "none",
            borderRadius: 6,
          }}
        >
          {loading ? "Running..." : "Analyze"}
        </button>
        <button
          onClick={() => { setInputs(""); setOutput(""); setErrorMessage(null); }}
          disabled={loading}
          style={{
            padding: "10px 14px",
            background: "transparent",
            color: "var(--foreground)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 6,
            backgroundColor: "rgba(248,113,113,0.15)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "#fca5a5",
            fontSize: 14,
          }}
        >
          {errorMessage}
        </div>
      )}

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, padding: 12, color: "var(--foreground)", opacity: 0.9 }}>
        {output}
      </pre>
    </main>
  );
}
