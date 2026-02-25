"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UsageToday = {
  used: number;
  limit: number;
  percent: number;
  plan: string;
  deal_scans_used?: number;
  deal_scans_limit?: number;
  percent_deal_scans?: number;
};

export default function UsageBanner() {
  const [usage, setUsage] = useState<UsageToday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage/today", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UsageToday | null) => {
        setUsage(data ?? null);
      })
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !usage) return null;

  const {
    used,
    limit,
    percent,
    deal_scans_used = 0,
    deal_scans_limit = 0,
    percent_deal_scans = 0,
  } = usage;

  const analyzeAtLimit = limit > 0 && percent >= 1;
  const dealScansAtLimit = deal_scans_limit > 0 && percent_deal_scans >= 1;
  const atLimit = analyzeAtLimit || dealScansAtLimit;

  const analyzeWarn = limit > 0 && percent >= 0.8 && percent < 1;
  const dealScansWarn = deal_scans_limit > 0 && percent_deal_scans >= 0.8 && percent_deal_scans < 1;
  const warn = analyzeWarn || dealScansWarn;

  // Block: at or over 100% for either
  if (atLimit) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 8,
          backgroundColor: "rgba(248,113,113,0.15)",
          border: "1px solid rgba(248,113,113,0.4)",
          color: "#fca5a5",
          fontSize: 14,
        }}
      >
        Daily limit reached
        {(analyzeAtLimit && dealScansAtLimit && " (analyses and deal scans).") ||
          (analyzeAtLimit && " (analyses).") ||
          " (deal scans)."}{" "}
        <Link href="/pricing" style={{ color: "#fcd34d", fontWeight: 600 }}>
          Upgrade to continue.
        </Link>
      </div>
    );
  }

  // Soft warning: >= 80% and < 100%
  if (warn) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 8,
          backgroundColor: "rgba(251,191,36,0.15)",
          border: "1px solid rgba(251,191,36,0.4)",
          color: "#fde047",
          fontSize: 14,
        }}
      >
        Usage: analyses {used}/{limit}
        {deal_scans_limit > 0 && ` · deal scans ${deal_scans_used}/${deal_scans_limit}`}.{" "}
        <Link href="/pricing" style={{ color: "#fcd34d", fontWeight: 600 }}>
          Upgrade for higher limits.
        </Link>
      </div>
    );
  }

  return null;
}
