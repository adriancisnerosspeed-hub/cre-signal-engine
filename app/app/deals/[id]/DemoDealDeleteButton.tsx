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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#e4e4e7", fontSize: 13 }}>Delete this demo deal?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          style={{
            padding: "4px 12px",
            backgroundColor: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          style={{
            padding: "4px 12px",
            backgroundColor: "transparent",
            color: "#a1a1aa",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 4,
            fontSize: 13,
            cursor: "pointer",
          }}
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
      style={{
        padding: "4px 12px",
        backgroundColor: "transparent",
        color: "#a1a1aa",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 4,
        fontSize: 13,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Delete demo deal
    </button>
  );
}
