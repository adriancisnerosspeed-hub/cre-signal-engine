"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function UpgradeButton() {
  const [loading, setLoading] = useState(false);
  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setLoading(false);
    } catch {
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
      {loading ? "Redirecting…" : "Upgrade to Pro"}
    </button>
  );
}

const PRO_BENEFITS = [
  "Higher daily scan limits",
  "IC Memorandum Narrative generation",
  "Scan history",
  "Institutional export",
  "Workspace collaboration",
];

const LIFETIME_LIMIT_BULLETS = [
  "Unlimited deal scans",
  "Full CRE Signal Risk Index™",
  "Full macro signal overlay",
  "IC Memorandum PDF export",
  "Risk percentile benchmarking",
  "Scenario comparison tools",
  "Workspace collaboration",
];

export default function PaywallModal({
  open,
  onClose,
  title = "Upgrade to Pro",
  subtitle,
  redactedPreview,
  variant = "default",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  redactedPreview?: string;
  variant?: "default" | "lifetime_limit";
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
          <p style={{ fontSize: 14, color: "#e4e4e7", marginBottom: 6 }}>Upgrade to Pro to unlock:</p>
          <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: "#a1a1aa" }}>
            {LIFETIME_LIMIT_BULLETS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 8 }}>
            At $99/month, Pro is a rounding error relative to underwriting risk.
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
            <UpgradeButton />
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
        <p style={{ fontSize: 13, color: "#e4e4e7", marginBottom: 8 }}>Pro includes:</p>
        <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 13, color: "#a1a1aa" }}>
          {PRO_BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <UpgradeButton />
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
