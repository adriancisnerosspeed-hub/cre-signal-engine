"use client";

import { useEffect, useState } from "react";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type RiskTrendPoint = { date: string; avg_score: number; point_count: number };

type DashboardData = {
  risk_trend: RiskTrendPoint[];
  policy_violation_count: number;
  policy_overall_status: string | null;
  override_count: number;
  total_deals: number;
  scanned_count: number;
  days: number;
};

export default function GovernanceDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJsonWithTimeout(`/api/governance/dashboard?days=${days}`, {}, 15000)
      .then((res) => {
        if (cancelled) return;
        const json = res.json as DashboardData | undefined;
        if (!res.ok) {
          setError((json as { error?: string })?.error ?? `Error ${res.status}`);
          setData(null);
          return;
        }
        setData(json ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load dashboard");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading && !data) {
    return <p style={{ color: "#a1a1aa" }}>Loading…</p>;
  }
  if (error && !data) {
    return <p style={{ color: "#f87171" }}>{error}</p>;
  }
  if (!data) {
    return <p style={{ color: "#71717a" }}>No data.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 14, color: "#a1a1aa" }}>
          Last{" "}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ marginLeft: 4, padding: "4px 8px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "#fafafa" }}
          >
            <option value={7}>7</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>{" "}
          days
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Total deals</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fafafa" }}>{data.total_deals}</div>
        </div>
        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Scanned</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fafafa" }}>{data.scanned_count}</div>
        </div>
        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Policy violations</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.policy_violation_count > 0 ? "#f87171" : "#fafafa" }}>
            {data.policy_violation_count}
          </div>
        </div>
        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Overrides</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fafafa" }}>{data.override_count}</div>
        </div>
        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Policy status</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: data.policy_overall_status === "BLOCK" ? "#f87171" : data.policy_overall_status === "WARN" ? "#fbbf24" : "#22c55e" }}>
            {data.policy_overall_status ?? "—"}
          </div>
        </div>
      </div>

      {data.risk_trend.length > 0 && (
        <section style={{ padding: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 12 }}>Risk trend (avg score by day)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#71717a", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#71717a", fontWeight: 600 }}>Avg score</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#71717a", fontWeight: 600 }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {data.risk_trend.slice(-14).reverse().map((p) => (
                  <tr key={p.date} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{p.date}</td>
                    <td style={{ padding: "8px 12px", color: "#a1a1aa", textAlign: "right" }}>{p.avg_score}</td>
                    <td style={{ padding: "8px 12px", color: "#71717a", textAlign: "right" }}>{p.point_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.risk_trend.length === 0 && (
        <p style={{ color: "#71717a", fontSize: 14 }}>No risk history in the selected period. Run scans to populate risk score history.</p>
      )}
    </div>
  );
}
