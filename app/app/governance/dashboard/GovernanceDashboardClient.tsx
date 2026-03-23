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
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (error && !data) {
    return <p className="text-red-400">{error}</p>;
  }
  if (!data) {
    return <p className="text-muted-foreground/70">No data.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-muted-foreground">
          Last{" "}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-1 px-2 py-1 bg-background border border-border rounded text-foreground"
          >
            <option value={7}>7</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>{" "}
          days
        </label>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Total deals</div>
          <div className="text-2xl font-bold text-foreground">{data.total_deals}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Scanned</div>
          <div className="text-2xl font-bold text-foreground">{data.scanned_count}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Policy violations</div>
          <div className={`text-2xl font-bold ${data.policy_violation_count > 0 ? "text-red-400" : "text-foreground"}`}>
            {data.policy_violation_count}
          </div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Overrides</div>
          <div className="text-2xl font-bold text-foreground">{data.override_count}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Policy status</div>
          <div className={`text-base font-semibold ${data.policy_overall_status === "BLOCK" ? "text-red-400" : data.policy_overall_status === "WARN" ? "text-yellow-400" : "text-green-500"}`}>
            {data.policy_overall_status ?? "—"}
          </div>
        </div>
      </div>

      {data.risk_trend.length > 0 && (
        <section className="p-5 bg-card border border-border rounded-lg">
          <h2 className="text-base font-semibold text-foreground mb-3">Risk trend (avg score by day)</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground font-semibold">Date</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Avg score</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-semibold">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.risk_trend.slice(-14).reverse().map((p) => (
                  <tr key={p.date} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground">{p.date}</td>
                    <td className="px-3 py-2 text-muted-foreground text-right">{p.avg_score}</td>
                    <td className="px-3 py-2 text-muted-foreground/70 text-right">{p.point_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.risk_trend.length === 0 && (
        <p className="text-muted-foreground/70 text-sm">No risk history in the selected period. Run scans to populate risk score history.</p>
      )}
    </div>
  );
}
