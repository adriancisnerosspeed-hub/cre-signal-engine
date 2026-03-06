"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

const CHECKOUT_TIMEOUT_MS = 15_000;

function UpgradeButton({ workspaceId }: { workspaceId?: string }) {
  const [loading, setLoading] = useState(false);
  async function handleUpgrade() {
    setLoading(true);
    try {
      const url = workspaceId ? "/api/billing/create-checkout-session" : "/api/stripe/checkout";
      const r = await fetchJsonWithTimeout(url, {
        method: "POST",
        headers: workspaceId ? { "Content-Type": "application/json" } : undefined,
        body: workspaceId ? JSON.stringify({ workspace_id: workspaceId, plan: "PRO" }) : undefined,
      }, CHECKOUT_TIMEOUT_MS);
      const checkoutUrl = r?.json?.url as string | undefined;
      if (!r.ok || !checkoutUrl) {
        toast((r?.json?.error as string | undefined) ?? "Failed to start checkout", "error");
        return;
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to start checkout", "error");
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handleUpgrade}
      disabled={loading}
      style={{
        padding: "10px 20px",
        backgroundColor: "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        fontSize: 14,
      }}
    >
      {loading ? "Redirecting…" : "Upgrade to Starter"}
    </button>
  );
}

const PRO_BENEFITS = [
  "Unlimited deal scans",
  "Full CRE Signal Risk Index™ (Institutional Stable)",
  "Snapshot-based benchmark percentiles",
  "IC-ready PDF export & support bundle export",
  "Portfolio dashboard & risk movement tracking",
  "1 active governance policy",
  "Up to 5 workspace members",
];

const LIFETIME_LIMIT_BULLETS = [
  "Unlimited deal scans",
  "Full CRE Signal Risk Index™ (Institutional Stable)",
  "Snapshot-based benchmark percentiles",
  "IC-ready PDF export & support bundle export",
  "Portfolio dashboard & risk movement tracking",
  "1 active governance policy",
  "Up to 5 workspace members",
];

export default function PaywallModal({
  open,
  onClose,
  title = "Upgrade to Starter",
  subtitle,
  redactedPreview,
  variant = "default",
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  redactedPreview?: string;
  variant?: "default" | "lifetime_limit";
  workspaceId?: string;
}) {
  const router = useRouter();
  const isLifetimeLimit = variant === "lifetime_limit";

  if (!open) return null;

  const handleBackdropClick = () => {
    if (!isLifetimeLimit) onClose();
  };

  const handleReturnToDeals = () => {
    router.push("/app/deals");
    onClose();
  };

  if (isLifetimeLimit) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 12,
            maxWidth: 440,
            width: "90%",
            padding: 24,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
            Institutional Features Locked
          </h2>
          <p style={{ fontSize: 14, color: "#e4e4e7", marginBottom: 8 }}>
            You&apos;ve used your 3 Free underwriting scans.
          </p>
          <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 12 }}>
            CRE Signal Engine is built for real capital decisions — not casual exploration.
          </p>
          <p style={{ fontSize: 14, color: "#e4e4e7", marginBottom: 6 }}>Upgrade to Starter to unlock:</p>
          <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: "#a1a1aa" }}>
            {LIFETIME_LIMIT_BULLETS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 8 }}>
            At $299/workspace/month, PRO is a rounding error relative to underwriting risk.
          </p>
          <p style={{ fontSize: 13, color: "#71717a", marginBottom: 4 }}>
            Used by underwriting teams evaluating institutional real estate.
          </p>
          <p style={{ fontSize: 13, color: "#71717a", marginBottom: 12 }}>
            Your deals and scan history remain saved.
          </p>
          <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
            Your underwriting data remains intact. Upgrade takes less than 30 seconds.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <UpgradeButton workspaceId={workspaceId} />
            <button
              type="button"
              onClick={handleReturnToDeals}
              style={{
                padding: "10px 20px",
                backgroundColor: "transparent",
                color: "#a1a1aa",
                border: "1px solid #52525b",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Return to Deals
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.7)",
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#18181b",
          border: "1px solid #3f3f46",
          borderRadius: 12,
          maxWidth: 440,
          width: "90%",
          padding: 24,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16 }}>{subtitle}</p>
        )}
        {redactedPreview && (
          <div
            style={{
              padding: 12,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              color: "#71717a",
              border: "1px dashed rgba(255,255,255,0.2)",
            }}
          >
            {redactedPreview}
            <div style={{ marginTop: 8, fontSize: 12, color: "#a1a1aa" }}>[Pro feature]</div>
          </div>
        )}
        <p style={{ fontSize: 13, color: "#e4e4e7", marginBottom: 8 }}>PRO includes:</p>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 13, color: "#a1a1aa" }}>
          {PRO_BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <UpgradeButton workspaceId={workspaceId} />
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              backgroundColor: "transparent",
              color: "#a1a1aa",
              border: "1px solid #52525b",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
