"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";

export default function DealDetailClient({
  dealId,
  hasScan,
}: {
  dealId: string;
  hasScan: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshScanHint, setFreshScanHint] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [lifetimeLimitPaywall, setLifetimeLimitPaywall] = useState(false);

  async function handleRunScan() {
    setError(null);
    setFreshScanHint(false);
    setLoading(true);
    try {
      const body = hasScan ? { deal_id: dealId, force: 1 } : { deal_id: dealId };
      const res = await fetch("/api/deals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.code === "LIFETIME_LIMIT_REACHED") {
          setError(null);
          setPaywallOpen(true);
          setLifetimeLimitPaywall(true);
          return;
        }
        if (res.status === 429) {
          setError(`Daily limit reached (${data.used ?? 0}/${data.limit ?? 0}). Upgrade for more scans.`);
          setPaywallOpen(true);
          setLifetimeLimitPaywall(false);
          return;
        }
        setError(data.error || `Error ${res.status}`);
        return;
      }
      if (hasScan && !data.reused) setFreshScanHint(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <p style={{ marginBottom: 8, fontSize: 14, color: "#ef4444" }}>{error}</p>
      )}
      {freshScanHint && (
        <p style={{ marginBottom: 8, fontSize: 14, color: "#22c55e" }}>Fresh scan started…</p>
      )}
      <PaywallModal
        open={paywallOpen}
        onClose={() => { setPaywallOpen(false); setLifetimeLimitPaywall(false); }}
        variant={lifetimeLimitPaywall ? "lifetime_limit" : "default"}
        title={lifetimeLimitPaywall ? undefined : "Daily limit reached"}
        subtitle={lifetimeLimitPaywall ? undefined : "Upgrade to Pro for higher scan limits, IC Memorandum Narrative, and more."}
      />
      <button
        type="button"
        onClick={handleRunScan}
        disabled={loading}
        style={{
          padding: "10px 20px",
          backgroundColor: "var(--foreground)",
          color: "var(--background)",
          border: "none",
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Running scan…" : hasScan ? "Rescan (Fresh)" : "Run Deal Risk Scan"}
      </button>
    </div>
  );
}
