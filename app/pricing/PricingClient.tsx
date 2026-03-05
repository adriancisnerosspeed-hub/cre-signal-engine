"use client";

import { useState } from "react";
import type { PricingDisplayPlan } from "@/app/pricing/types";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

const unavailableButtonStyle = {
  padding: "10px 20px",
  backgroundColor: "#27272a",
  color: "#71717a",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "not-allowed" as const,
  opacity: 0.5,
  fontSize: 14,
};

export default function PricingClient({
  displayPlan,
  workspaceId,
  slot,
  checkoutAvailable = true,
}: {
  displayPlan: PricingDisplayPlan;
  workspaceId?: string;
  slot: "pro" | "pro_plus" | "enterprise" | "enterprise_tier" | "founding";
  /** When false (e.g. Stripe price env vars missing), show disabled "Unavailable" instead of checkout. */
  checkoutAvailable?: boolean;
}) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errorBlock = error ? (
    <p style={{ marginTop: 8, fontSize: 13, color: "#ef4444" }}>{error}</p>
  ) : null;

  async function handleUpgrade(plan?: "PRO" | "PRO+" | "ENTERPRISE" | "FOUNDING") {
    setError(null);
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
        setError((r?.json?.error as string | undefined) ?? "Failed to start checkout");
        return;
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setError(null);
    setLoading("portal");
    try {
      const r = await fetchJsonWithTimeout("/api/stripe/portal", { method: "POST" });
      const portalUrl = r?.json?.url as string | undefined;
      if (!r.ok || !portalUrl) {
        setError((r?.json?.error as string | undefined) ?? "Failed to open billing portal");
        return;
      }
      window.location.href = portalUrl;
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to open billing portal");
    } finally {
      setLoading(null);
    }
  }

  if (slot === "pro_plus") {
    if (displayPlan === "pro_plus") {
      return (
        <>
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
          {errorBlock}
        </>
      );
    }
    if (displayPlan === "platform_admin" || displayPlan === "enterprise") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          {displayPlan === "platform_admin" ? "Included in your Enterprise access (Platform Admin)" : "Included in your Enterprise plan"}
        </span>
      );
    }
    if (!checkoutAvailable) {
      return <button type="button" disabled style={unavailableButtonStyle}>Unavailable</button>;
    }
    return (
      <>
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
          {loading === "checkout" ? "Redirecting…" : "Start Analyst Plan"}
        </button>
        {errorBlock}
      </>
    );
  }

  if (slot === "enterprise") {
    if (displayPlan === "enterprise") {
      return (
        <>
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
          {errorBlock}
        </>
      );
    }
    if (displayPlan === "platform_admin") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          Included in your Enterprise access (Platform Admin)
        </span>
      );
    }
    if (!checkoutAvailable) {
      return <button type="button" disabled style={unavailableButtonStyle}>Unavailable</button>;
    }
    return (
      <>
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
          {loading === "checkout" ? "Redirecting…" : "Start Fund Plan"}
        </button>
        {errorBlock}
      </>
    );
  }

  if (slot === "enterprise_tier") {
    if (displayPlan === "platform_admin") {
      return (
        <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
          You have Enterprise access (Platform Admin)
        </span>
      );
    }
    if (displayPlan === "enterprise") {
      return (
        <>
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
          {errorBlock}
        </>
      );
    }
    return (
      <div>
        <a
          href="mailto:adriancisnerosspeed@gmail.com?subject=CRE%20Signal%20Engine%20Enterprise%20Inquiry&body=I'm%20interested%20in%20the%20Enterprise%20plan.%0A%0AName%3A%20%0AOrganization%3A%20%0AMonthly%20deal%20volume%3A%20%0ATeam%20size%3A%20"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            backgroundColor: "#27272a",
            color: "#e4e4e7",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
            fontSize: 14,
            border: "1px solid #3f3f46",
            cursor: "pointer",
          }}
        >
          Contact Sales
        </a>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71717a" }}>
          We&apos;ll respond within 1 business day.
        </p>
      </div>
    );
  }

  if (slot === "pro") {
    if (displayPlan === "pro") {
      return (
        <>
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
          {errorBlock}
        </>
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
    if (!checkoutAvailable) {
      return <button type="button" disabled style={unavailableButtonStyle}>Unavailable</button>;
    }
    return (
      <>
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
          {loading === "checkout" ? "Redirecting…" : "Start Starter Plan"}
        </button>
        {errorBlock}
      </>
    );
  }

  if (slot === "founding") {
    if (displayPlan === "pro_plus" || displayPlan === "platform_admin" || displayPlan === "enterprise") {
      return (
        <span style={{ color: "#71717a", fontSize: 14 }}>
          Analyst tier already included in your plan
        </span>
      );
    }
    if (!checkoutAvailable) {
      return <button type="button" disabled style={{ ...unavailableButtonStyle, backgroundColor: "#27272a", color: "#71717a" }}>Unavailable</button>;
    }
    return (
      <>
        <button
          type="button"
          onClick={() => handleUpgrade("FOUNDING")}
          disabled={!!loading}
          style={{
            padding: "10px 20px",
            backgroundColor: "#eab308",
            color: "#000",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 14,
          }}
        >
          {loading === "checkout" ? "Redirecting…" : "Claim Founding Member — $147/mo"}
        </button>
        {errorBlock}
      </>
    );
  }

  return null;
}
