"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "cre_trial_banner_dismissed_date";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TrialBanner({
  isTrialing,
  trialDaysRemaining,
  trialExpired,
}: {
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  trialExpired: boolean;
}) {
  const [dismissed, setDismissed] = useState(true); // default hidden until hydration

  useEffect(() => {
    if (!isTrialing && !trialExpired) {
      setDismissed(true);
      return;
    }
    // Non-dismissable states: days 2-0 and expired
    if (trialExpired || (trialDaysRemaining !== null && trialDaysRemaining <= 2)) {
      setDismissed(false);
      return;
    }
    // Dismissable states: days 7-3 — reappears next day
    try {
      const savedDate = localStorage.getItem(DISMISS_KEY);
      setDismissed(savedDate === todayStr());
    } catch {
      setDismissed(false);
    }
  }, [isTrialing, trialExpired, trialDaysRemaining]);

  if (dismissed) return null;

  const canDismiss = isTrialing && trialDaysRemaining !== null && trialDaysRemaining > 2;

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, todayStr());
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  // Color scheme based on urgency
  let bgClass: string;
  let borderClass: string;
  let textClass: string;
  let message: string;

  if (trialExpired) {
    bgClass = "bg-red-500/10";
    borderClass = "border-red-500/30";
    textClass = "text-red-400";
    message = "Your Starter trial has ended. You're on the Free plan (3 lifetime scans). Upgrade to continue.";
  } else if (trialDaysRemaining !== null && trialDaysRemaining <= 0) {
    bgClass = "bg-red-500/10";
    borderClass = "border-red-500/30";
    textClass = "text-red-400";
    message = "Your trial ends today!";
  } else if (trialDaysRemaining !== null && trialDaysRemaining <= 2) {
    bgClass = "bg-amber-500/10";
    borderClass = "border-amber-500/30";
    textClass = "text-amber-400";
    message = `Your trial ends in ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"}. Upgrade now.`;
  } else {
    bgClass = "bg-blue-500/10";
    borderClass = "border-blue-500/30";
    textClass = "text-blue-400";
    message = `Your Starter trial ends in ${trialDaysRemaining} days. Upgrade to keep unlimited scans and exports.`;
  }

  return (
    <div
      className={`w-full px-4 py-2.5 ${bgClass} border-b ${borderClass} flex items-center justify-between gap-3 text-sm`}
      role="status"
    >
      <p className={`${textClass} m-0 font-medium`}>
        {message}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/pricing"
          className={`${textClass} font-semibold text-sm no-underline hover:underline`}
        >
          Upgrade →
        </Link>
        {canDismiss && (
          <Button type="button" variant="ghost" size="xs" onClick={handleDismiss} className="text-zinc-400">
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
