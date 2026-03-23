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
      className="px-5 py-2.5 bg-blue-500 text-white border-none rounded-lg font-semibold text-sm cursor-pointer disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-card border border-border rounded-xl max-w-[440px] w-[90%] p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-foreground mb-2">
            Institutional Features Locked
          </h2>
          <p className="text-sm text-foreground mb-2">
            You&apos;ve used your 3 Free underwriting scans.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            CRE Signal Engine is built for real capital decisions — not casual exploration.
          </p>
          <p className="text-sm text-foreground mb-1.5">Upgrade to Starter to unlock:</p>
          <ul className="m-0 mb-3 pl-5 text-[13px] text-muted-foreground">
            {LIFETIME_LIMIT_BULLETS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mb-2">
            At $299/workspace/month, PRO is a rounding error relative to underwriting risk.
          </p>
          <p className="text-[13px] text-muted-foreground/70 mb-1">
            Used by underwriting teams evaluating institutional real estate.
          </p>
          <p className="text-[13px] text-muted-foreground/70 mb-3">
            Your deals and scan history remain saved.
          </p>
          <p className="text-[13px] text-muted-foreground/70 mb-4">
            Your underwriting data remains intact. Upgrade takes less than 30 seconds.
          </p>
          <div className="flex gap-3 flex-wrap">
            <UpgradeButton workspaceId={workspaceId} />
            <button
              type="button"
              onClick={handleReturnToDeals}
              className="px-5 py-2.5 bg-transparent text-muted-foreground border border-border rounded-lg cursor-pointer text-sm hover:bg-muted/50 transition-colors"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card border border-border rounded-xl max-w-[440px] w-[90%] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground mb-2">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        )}
        {redactedPreview && (
          <div className="p-3 bg-muted/50 rounded-lg mb-4 text-[13px] text-muted-foreground/70 border border-dashed border-border">
            {redactedPreview}
            <div className="mt-2 text-xs text-muted-foreground">[Pro feature]</div>
          </div>
        )}
        <p className="text-[13px] text-foreground mb-2">PRO includes:</p>
        <ul className="m-0 mb-4 pl-5 text-[13px] text-muted-foreground">
          {PRO_BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div className="flex gap-3 flex-wrap">
          <UpgradeButton workspaceId={workspaceId} />
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-transparent text-muted-foreground border border-border rounded-lg cursor-pointer text-sm hover:bg-muted/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
