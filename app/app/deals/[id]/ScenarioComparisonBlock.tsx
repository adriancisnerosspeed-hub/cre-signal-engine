"use client";

import { useState } from "react";
import PaywallModal from "@/app/components/PaywallModal";

type ScanOption = { id: string; created_at: string; risk_index_band: string | null };

export default function ScenarioComparisonBlock({
  dealId,
  scans,
  plan,
}: {
  dealId: string;
  scans: ScanOption[];
  plan: "free" | "pro" | "owner";
}) {
  const [baseId, setBaseId] = useState<string>(scans[0]?.id ?? "");
  const [conservativeId, setConservativeId] = useState<string>(scans[1]?.id ?? "");
  const [diff, setDiff] = useState<{
    risk_score_delta: number;
    band_change: string | null;
    risks_added: number;
    risks_removed: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  async function handleCompare() {
    if (plan === "free") {
      setPaywallOpen(true);
      return;
    }
    if (!baseId || !conservativeId || baseId === conservativeId) return;
    setLoading(true);
    setDiff(null);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/scenario-diff?base=${encodeURIComponent(baseId)}&conservative=${encodeURIComponent(conservativeId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === "PRO_REQUIRED_FOR_SCENARIO") {
        setPaywallOpen(true);
        return;
      }
      if (res.ok) setDiff(data);
    } finally {
      setLoading(false);
    }
  }

  if (scans.length < 2) return null;

  if (plan === "free") {
    return (
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Scenario Comparison
        </h2>
        <div
          style={{
            padding: 20,
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            filter: "blur(4px)",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>
            Compare Base vs Conservative scan risk score and risk changes.
          </p>
        </div>
        <p style={{ marginTop: 12, fontSize: 14, color: "#a1a1aa" }}>
          Pro access required.
        </p>
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Upgrade to Pro
        </button>
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          title="Pro access required"
          subtitle="Scenario comparison is a Pro feature."
        />
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        Scenario Comparison
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "#a1a1aa", display: "block", marginBottom: 4 }}>Base</label>
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              minWidth: 200,
            }}
          >
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleString()} {s.risk_index_band ? `— ${s.risk_index_band}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#a1a1aa", display: "block", marginBottom: 4 }}>Conservative</label>
          <select
            value={conservativeId}
            onChange={(e) => setConservativeId(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              minWidth: 200,
            }}
          >
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleString()} {s.risk_index_band ? `— ${s.risk_index_band}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleCompare}
          disabled={loading || baseId === conservativeId}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "rgba(255,255,255,0.1)",
            color: "#e4e4e7",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            cursor: loading || baseId === conservativeId ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>
      {diff && (
        <div
          style={{
            padding: 16,
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.03)",
            fontSize: 14,
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#e4e4e7" }}>
            Risk index delta: {diff.risk_score_delta >= 0 ? "+" : ""}{diff.risk_score_delta}
          </p>
          {diff.band_change && (
            <p style={{ margin: "0 0 8px", color: "#a1a1aa" }}>Band: {diff.band_change}</p>
          )}
          <p style={{ margin: 0, color: "#a1a1aa" }}>
            Risks added: {diff.risks_added} · Risks removed: {diff.risks_removed}
          </p>
        </div>
      )}
    </section>
  );
}
