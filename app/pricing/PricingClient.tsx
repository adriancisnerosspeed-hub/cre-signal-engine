"use client";

import { useState } from "react";
import type { PricingDisplayPlan } from "@/app/pricing/types";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

export default function PricingClient({
  displayPlan,
  workspaceId,
  slot,
}: {
  displayPlan: PricingDisplayPlan;
  workspaceId?: string;
  slot: "pro" | "pro_plus" | "enterprise";
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade(plan?: "PRO" | "PRO+" | "ENTERPRISE") {
    setLoading("checkout");
    try {
      const url = workspaceId
        ? "/api/billing/create-checkout-session"
        : "/api/stripe/checkout";
      const body = workspaceId
        ? JSON.stringify({ workspace_id: workspaceId, ...(plan && { plan }) })
        : undefined;
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

  if (slot === "pro_plus") {
    if (displayPlan === "pro_plus") {
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
    if (displayPlan === "platform_admin" || displayPlan === "enterprise") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          {displayPlan === "platform_admin" ? "Included in your Enterprise access (Platform Admin)" : "Included in your Enterprise plan"}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleUpgrade("PRO+")}
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
        {loading === "checkout" ? "Redirecting…" : "Upgrade to PRO+"}
      </button>
    );
  }

  if (slot === "enterprise") {
    if (displayPlan === "enterprise") {
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
    if (displayPlan === "platform_admin") {
      return (
        <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
          You have Enterprise access (Platform Admin)
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleUpgrade("ENTERPRISE")}
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
        {loading === "checkout" ? "Redirecting…" : "Get Enterprise"}
      </button>
    );
  }

  if (slot === "pro") {
    if (displayPlan === "pro") {
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
    if (displayPlan === "platform_admin") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          Included in your Enterprise access (Platform Admin)
        </span>
      );
    }
    if (displayPlan === "enterprise") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          Included in your Enterprise plan
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleUpgrade("PRO")}
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
        {loading === "checkout" ? "Redirecting…" : "Start Institutional Plan"}
      </button>
    );
  }

  return null;
}
