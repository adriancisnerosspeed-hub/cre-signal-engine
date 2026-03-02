"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/entitlements";

const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = FETCH_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOptions, signal: controller.signal }).finally(() => clearTimeout(id));
}

export default function PricingClient({ plan, workspaceId }: { plan: Plan; workspaceId?: string }) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const url = workspaceId
        ? "/api/billing/create-checkout-session"
        : "/api/stripe/checkout";
      const body = workspaceId ? JSON.stringify({ workspace_id: workspaceId }) : undefined;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
      else alert((data as { error?: string }).error || "Failed to start checkout");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") alert("Request timed out. Try again.");
      else alert("Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const res = await fetchWithTimeout("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if ((data as { url?: string }).url) window.location.href = (data as { url: string }).url;
      else alert((data as { error?: string }).error || "Failed to open billing portal");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") alert("Request timed out. Try again.");
      else alert("Failed to open billing portal");
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
