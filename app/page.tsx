"use client";

import { useState } from "react";

export default function Home() {
  const [inputs, setInputs] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });

      const data = await res.json();
      setOutput(data.output ?? JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const e = err instanceof Error ? err : null;
      setOutput(String(e?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>CRE Signal Engine</h1>
      <p style={{ marginTop: 8 }}>
        Paste your inputs below (each paragraph = one input), then click Analyze.
      </p>

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
          disabled={loading || !inputs.trim()}
          style={{ padding: "10px 14px" }}
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
