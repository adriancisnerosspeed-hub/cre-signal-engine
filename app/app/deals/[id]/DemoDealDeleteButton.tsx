"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DemoDealDeleteButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/deals");
      } else {
        const json = await res.json().catch(() => ({}));
        alert((json as { error?: string }).error ?? "Failed to delete deal");
      }
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex gap-2 items-center">
        <span className="text-[13px] text-foreground">Delete this demo deal?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1 bg-destructive text-white border-0 rounded text-[13px] font-semibold disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-3 py-1 bg-transparent text-muted-foreground border border-border rounded text-[13px] cursor-pointer hover:bg-muted/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="px-3 py-1 bg-transparent text-muted-foreground border border-border rounded text-[13px] cursor-pointer whitespace-nowrap hover:bg-muted/50 transition-colors"
    >
      Delete demo deal
    </button>
  );
}
