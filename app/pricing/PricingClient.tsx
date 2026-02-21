"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/entitlements";

export default function PricingClient({ plan }: { plan: Plan }) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to open billing portal");
    } finally {
      setLoading(null);
    }
  }

  if (plan === "pro" || plan === "owner") {
    return (
      <button
        type="button"
        onClick={handleManageBilling}
        disabled={!!loading}
        style={{
          padding: "10px 20px",
          backgroundColor: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading === "portal" ? "Opening…" : "Manage billing"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleUpgrade}
      disabled={!!loading}
      style={{
        padding: "10px 20px",
        backgroundColor: "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
      }}
    >
      {loading === "checkout" ? "Redirecting…" : "Upgrade to Pro"}
    </button>
  );
}
