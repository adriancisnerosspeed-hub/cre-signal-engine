"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

export default function DealDetailClient({
  dealId,
  hasScan,
  workspaceId,
  justUpdatedInputs = false,
}: {
  dealId: string;
  hasScan: boolean;
  workspaceId?: string;
  justUpdatedInputs?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanBanner, setScanBanner] = useState<null | "started" | "completed">(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [lifetimeLimitPaywall, setLifetimeLimitPaywall] = useState(false);
  const clearBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearBannerTimeoutRef.current) clearTimeout(clearBannerTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!justUpdatedInputs) return;
    toast("Deal inputs updated successfully.", "success");
  }, [justUpdatedInputs]);

  async function handleRunScan() {
    setError(null);
    if (clearBannerTimeoutRef.current) clearTimeout(clearBannerTimeoutRef.current);
    if (hasScan) setScanBanner("started");
    else setScanBanner(null);
    setLoading(true);
    try {
      // WARNING: force:1 bypasses text-hash cache and can cause score drift on rescans.
      // Server-side authoritative text-hash lookup (route.ts Step 2) mitigates this,
      // but consider removing force:1 or making it opt-in with user warning.
      const body = hasScan ? { deal_id: dealId, force: 1 } : { deal_id: dealId };
      const r = await fetchJsonWithTimeout("/api/deals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, 120_000);
      const data = (r.json ?? {}) as { code?: string; error?: string; message?: string; reused?: boolean; used?: number; limit?: number };
      if (!r.ok) {
        setScanBanner(null);
        if ((r.status === 403 || r.status === 429) && data.code === "PLAN_LIMIT_REACHED") {
          setError(null);
          toast("Upgrade required to run additional scans.", "error");
          setPaywallOpen(true);
          setLifetimeLimitPaywall(true);
          return;
        }
        if (r.status === 429 && data.code === "LIFETIME_LIMIT_REACHED") {
          setError(null);
          toast("Upgrade required to run additional scans.", "error");
          setPaywallOpen(true);
          setLifetimeLimitPaywall(true);
          return;
        }
        if (r.status === 429) {
          const msg = `Daily limit reached (${data.used ?? 0}/${data.limit ?? 0}). Upgrade for more scans.`;
          toast(msg, "error");
          setError(msg);
          setPaywallOpen(true);
          setLifetimeLimitPaywall(false);
          return;
        }
        const msg = data.error || data.message || `Error ${r.status}`;
        toast(msg, "error");
        setError(msg);
        return;
      }
      if (hasScan && !data.reused) {
        setScanBanner("completed");
        clearBannerTimeoutRef.current = setTimeout(() => setScanBanner(null), 3000);
      } else {
        setScanBanner(null);
      }
      router.refresh();
    } catch (err) {
      setScanBanner(null);
      if (err instanceof Error && err.name === "AbortError") {
        const msg = "Scan is taking longer than expected. Refresh the page to check status.";
        toast(msg, "error");
        setError(msg);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to run scan";
        toast(msg, "error");
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <p style={{ marginBottom: 8, fontSize: 14, color: "#ef4444" }}>{error}</p>
      )}
      {scanBanner === "started" && (
        <p style={{ marginBottom: 8, fontSize: 14, color: "#a78bfa" }}>Fresh scan started…</p>
      )}
      {scanBanner === "completed" && (
        <p style={{ marginBottom: 8, fontSize: 14, color: "#22c55e" }}>Scan completed</p>
      )}
      <PaywallModal
        open={paywallOpen}
        onClose={() => { setPaywallOpen(false); setLifetimeLimitPaywall(false); }}
        variant={lifetimeLimitPaywall ? "lifetime_limit" : "default"}
        title={lifetimeLimitPaywall ? undefined : "Daily limit reached"}
        subtitle={lifetimeLimitPaywall ? undefined : "Upgrade to Starter for higher scan limits, IC Memorandum Narrative, and more."}
        workspaceId={workspaceId}
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
