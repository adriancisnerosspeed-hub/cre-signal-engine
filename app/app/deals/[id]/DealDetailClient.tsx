"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        if (res.status === 429) {
          setError(`Daily limit reached (${data.used}/${data.limit}). Upgrade for more scans.`);
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
        {loading ? "Running scan…" : hasScan ? "Rescan" : "Run Deal Risk Scan"}
      </button>
    </div>
  );
}
