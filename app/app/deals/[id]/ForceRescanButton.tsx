"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/lib/toast";

export default function ForceRescanButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRescan() {
    setBusy(true);
    try {
      const res = await fetch("/api/deals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, force: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Rescan failed", "error");
        return;
      }
      const score = data.risk_index_score ?? data.risk_index_score;
      const band = data.risk_index_band;
      if (data.reused) {
        toast(`Cached score: ${score} (${band})`, "info");
      } else {
        toast(`New scan complete: score ${score ?? "—"} (${band ?? "—"})`, "success");
      }
      router.refresh();
    } catch (err) {
      toast("Rescan request failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRescan}
      disabled={busy}
      className="text-xs text-gray-500 hover:text-cyan-400 border border-gray-700 hover:border-cyan-400/40 rounded px-2 py-1 transition-colors disabled:opacity-50"
    >
      {busy ? "Rescanning…" : "Rescan (force)"}
    </button>
  );
}
