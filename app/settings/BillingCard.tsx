"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

/** Map internal plan slug to user-facing display name. */
function planDisplayName(plan: string): string {
  switch (plan) {
    case "free":
    case "FREE":
      return "Free (3 lifetime scans)";
    case "PRO":
      return "Starter";
    case "pro":
      return "Starter";
    case "PRO+":
      return "Analyst";
    case "ENTERPRISE":
      return "Fund";
    case "ENTERPRISE_CUSTOM":
      return "Enterprise";
    case "platform_admin":
      return "ENTERPRISE — Platform Admin";
    default:
      return plan || "Free (3 lifetime scans)";
  }
}

/** True if plan is paid (show Manage billing). */
function isPaidPlan(plan: string): boolean {
  return (
    plan === "platform_admin" ||
    plan === "pro" ||
    plan === "PRO" ||
    plan === "PRO+" ||
    plan === "ENTERPRISE" ||
    plan === "ENTERPRISE_CUSTOM"
  );
}

export default function BillingCard({
  plan,
  analyzeCallsToday,
  analyzeLimit,
  dealScansToday,
  dealScansLimit,
  digestScheduledEnabled,
  isTrialing,
  trialDaysRemaining,
}: {
  plan: string;
  analyzeCallsToday: number;
  analyzeLimit: number;
  dealScansToday: number;
  dealScansLimit: number;
  digestScheduledEnabled: boolean;
  isTrialing?: boolean;
  trialDaysRemaining?: number | null;
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

  const dealScansPercent = dealScansLimit > 0 ? Math.round((dealScansToday / dealScansLimit) * 100) : 0;

  const basePlanLabel = planDisplayName(plan);
  const planLabel = isTrialing && trialDaysRemaining != null
    ? `${basePlanLabel} (Trial — ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} remaining)`
    : basePlanLabel;

  return (
    <div className="p-4 rounded-xl mb-5 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-200 mb-3">
        Billing &amp; Usage
      </h2>
      <p className="text-[12px] text-gray-500 dark:text-zinc-400 mb-3">
        Workspace Governance Plan
      </p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
        Plan: <strong className="text-gray-900 dark:text-zinc-200">{planLabel}</strong>
      </p>
      {isPaidPlan(plan) && (
        <>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
            Active Policy: 1 / 1
          </p>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
            Snapshot Consumption: Enabled
          </p>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
            Cohort Creation: Fund and above
          </p>
        </>
      )}
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
        You&apos;ve used {dealScansToday} of {dealScansLimit} daily deal scans
        {dealScansLimit > 0 && ` (${dealScansPercent}% of limit)`}.
      </p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">
        Analyzes today: {analyzeCallsToday} / {analyzeLimit}
      </p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">
        Scheduled Risk Brief: {digestScheduledEnabled ? "Enabled" : "Starter and above"}
      </p>
      <div className="flex gap-3 flex-wrap">
        {isPaidPlan(plan) && !isTrialing ? (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={!!loading}
            className="py-2 px-4 bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-zinc-500 rounded-md font-medium text-sm disabled:cursor-not-allowed"
          >
            {loading === "portal" ? "Opening…" : "Manage billing"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={!!loading}
              className="py-2 px-4 bg-[#3b82f6] text-white border-0 rounded-md font-semibold text-sm disabled:cursor-not-allowed"
            >
              {loading === "checkout" ? "Redirecting…" : isTrialing ? "Subscribe Now" : "Start Institutional Plan"}
            </button>
            <Link
              href="/pricing"
              className="text-[#3b82f6] text-sm self-center"
            >
              View pricing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
