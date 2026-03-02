"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/entitlements";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

export default function PricingClient({ plan, workspaceId }: { plan: Plan; workspaceId?: string }) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const url = workspaceId
        ? "/api/billing/create-checkout-session"
        : "/api/stripe/checkout";
      const body = workspaceId ? JSON.stringify({ workspace_id: workspaceId }) : undefined;
      const r = await fetchJsonWithTimeout(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
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
