"use client";

import { useState } from "react";
import PaywallModal from "@/app/components/PaywallModal";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type ScanOption = { id: string; created_at: string; risk_index_band: string | null };

export default function ScenarioComparisonBlock({
  dealId,
  scans,
  plan,
  explainabilityEnabled = true,
}: {
  dealId: string;
  scans: ScanOption[];
  plan: "free" | "pro" | "platform_admin";
  explainabilityEnabled?: boolean;
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

  const showPaywall = !explainabilityEnabled || plan === "free";

  async function handleCompare() {
    if (showPaywall) {
      setPaywallOpen(true);
      return;
    }
    if (!baseId || !conservativeId || baseId === conservativeId) return;
    setLoading(true);
    setDiff(null);
    try {
      const res = await fetchJsonWithTimeout(
        `/api/deals/${dealId}/scenario-diff?base=${encodeURIComponent(baseId)}&conservative=${encodeURIComponent(conservativeId)}`,
        {},
        15000
      );
      const data = res.json ?? {};
      if (res.status === 403 && (data as { code?: string }).code === "PRO_REQUIRED_FOR_SCENARIO") {
        setPaywallOpen(true);
        return;
      }
      if (res.ok) setDiff(data);
    } finally {
      setLoading(false);
    }
  }

  if (scans.length < 2) return null;

  if (showPaywall) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          Scenario Comparison
        </h2>
        <div
          className="p-5 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 rounded-lg"
          style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}
        >
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Compare Base vs Conservative scan risk score and risk changes.
          </p>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Starter plan required.
        </p>
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          className="mt-2 py-2 px-4 text-sm text-white border-0 rounded-md cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          Upgrade to Starter
        </button>
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          title="Starter plan required"
          subtitle="Scenario comparison is a Starter feature."
        />
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
        Scenario Comparison
      </h2>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Base</label>
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="py-2 px-3 text-sm bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-white/20 rounded-md min-w-[200px]"
          >
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleString()} {s.risk_index_band ? `— ${s.risk_index_band}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Conservative</label>
          <select
            value={conservativeId}
            onChange={(e) => setConservativeId(e.target.value)}
            className="py-2 px-3 text-sm bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-white/20 rounded-md min-w-[200px]"
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
          className="py-2 px-4 text-sm bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-white/20 rounded-md disabled:cursor-not-allowed"
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>
      {diff && (
        <div className="p-4 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03] text-sm">
          <p className="text-gray-900 dark:text-zinc-200 mb-2 m-0">
            Risk index delta: {diff.risk_score_delta >= 0 ? "+" : ""}{diff.risk_score_delta}
          </p>
          {diff.band_change && (
            <p className="text-gray-500 dark:text-gray-400 mb-2 m-0">Band: {diff.band_change}</p>
          )}
          <p className="text-gray-500 dark:text-gray-400 m-0">
            Risks added: {diff.risks_added} · Risks removed: {diff.risks_removed}
          </p>
        </div>
      )}
    </section>
  );
}
