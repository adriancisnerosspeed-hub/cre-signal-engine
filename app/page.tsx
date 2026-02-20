"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthStatus from "./components/AuthStatus";

export default function Home() {
  const [inputs, setInputs] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const supabase = createClient();

  useEffect(() => {
    // Check auth state
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function run() {
    if (!isAuthenticated) {
      setOutput("Error: Please sign in to use the analyze feature.");
      return;
    }

    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Ensure cookies are sent
        body: JSON.stringify({ inputs }),
      });

      if (res.status === 401) {
        const data = await res.json();
        setOutput(`Error: ${data.message || "Unauthorized. Please sign in."}`);
        setIsAuthenticated(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setOutput(`Error: ${data.error || "Request failed"}`);
        return;
      }

      const data = await res.json();
      setOutput(data.output ?? JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const e = err instanceof Error ? err : null;
      setOutput(`Error: ${e?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>CRE Signal Engine</h1>
        <AuthStatus />
      </div>

      <p style={{ marginTop: 8 }}>
        Paste your inputs below (each paragraph = one input), then click Analyze.
      </p>

      {isAuthenticated === false && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 4,
            color: "#856404",
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
        }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          onClick={run}
          disabled={loading || !inputs.trim() || isAuthenticated === false}
          style={{
            padding: "10px 14px",
            opacity: isAuthenticated === false ? 0.6 : 1,
            cursor: isAuthenticated === false ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Running..." : "Analyze"}
        </button>

        <button
          onClick={() => {
            setInputs("");
            setOutput("");
          }}
          disabled={loading}
          style={{ padding: "10px 14px" }}
        >
          Clear
        </button>
      </div>

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, padding: 12 }}>
        {output}
      </pre>
    </main>
  );
}
