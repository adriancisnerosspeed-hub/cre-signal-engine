"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/entitlements";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

export default function BillingCard({
  plan,
  analyzeCallsToday,
  analyzeLimit,
  dealScansToday,
  dealScansLimit,
  digestScheduledEnabled,
}: {
  plan: Plan;
  analyzeCallsToday: number;
  analyzeLimit: number;
  dealScansToday: number;
  dealScansLimit: number;
  digestScheduledEnabled: boolean;
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const r = await fetchJsonWithTimeout("/api/stripe/checkout", { method: "POST" });
      const checkoutUrl = r?.json?.url as string | undefined;
      if (!r.ok || !checkoutUrl) {
        toast((r?.json?.error as string | undefined) ?? "Failed to start checkout", "error");
        return;
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to start checkout", "error");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const r = await fetchJsonWithTimeout("/api/stripe/portal", { method: "POST" });
      const portalUrl = r?.json?.url as string | undefined;
      if (!r.ok || !portalUrl) {
        toast((r?.json?.error as string | undefined) ?? "Failed to open billing portal", "error");
        return;
      }
      window.location.href = portalUrl;
    } catch (e) {
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to open billing portal", "error");
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

  const dealScansPercent = dealScansLimit > 0 ? Math.round((dealScansToday / dealScansLimit) * 100) : 0;

  const planLabel = plan === "pro" || plan === "owner" ? "PRO — Institutional Workspace" : plan;

  return (
    <div style={blockStyle}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        Billing &amp; Usage
      </h2>
      <p style={{ color: "#71717a", fontSize: 12, marginBottom: 12 }}>
        Workspace Governance Plan
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
        Plan: <strong style={{ color: "#e4e4e7" }}>{planLabel}</strong>
      </p>
      {(plan === "pro" || plan === "owner") && (
        <>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
            Active Policy: 1 / 1
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
            Snapshot Consumption: Enabled
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
            Cohort Creation: Enterprise Required
          </p>
        </>
      )}
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
        You&apos;ve used {dealScansToday} of {dealScansLimit} daily deal scans
        {dealScansLimit > 0 && ` (${dealScansPercent}% of limit)`}.
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
        Analyzes today: {analyzeCallsToday} / {analyzeLimit}
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
        Scheduled Risk Brief: {digestScheduledEnabled ? "Enabled" : "Pro only"}
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
              {loading === "checkout" ? "Redirecting…" : "Start Institutional Plan"}
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
