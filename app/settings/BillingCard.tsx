"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/entitlements";

export default function BillingCard({
  plan,
  analyzeCallsToday,
  analyzeLimit,
  digestScheduledEnabled,
}: {
  plan: Plan;
  analyzeCallsToday: number;
  analyzeLimit: number;
  digestScheduledEnabled: boolean;
}) {
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

  const blockStyle = {
    padding: 16,
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 10,
    marginBottom: 20,
  };

  return (
    <div style={blockStyle}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        Billing & usage
      </h2>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
        Plan: <strong style={{ color: "#e4e4e7" }}>{plan}</strong>
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
        Analyzes today: {analyzeCallsToday} / {analyzeLimit}
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
        Scheduled digest: {digestScheduledEnabled ? "Enabled" : "Pro only"}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {plan === "pro" || plan === "owner" ? (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={!!loading}
            style={{
              padding: "8px 16px",
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              border: "1px solid #52525b",
              borderRadius: 6,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "portal" ? "Opening…" : "Manage billing"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={!!loading}
              style={{
                padding: "8px 16px",
                backgroundColor: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "checkout" ? "Redirecting…" : "Upgrade to Pro"}
            </button>
            <Link
              href="/pricing"
              style={{ color: "#3b82f6", fontSize: 14, alignSelf: "center" }}
            >
              View pricing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
