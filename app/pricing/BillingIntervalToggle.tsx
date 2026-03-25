"use client";

import { useBillingInterval, type BillingInterval } from "./BillingIntervalContext";

export default function BillingIntervalToggle() {
  const { interval, setInterval } = useBillingInterval();

  function pill(label: string, value: BillingInterval, badge?: string) {
    const active = interval === value;
    return (
      <button
        type="button"
        onClick={() => setInterval(value)}
        className={`relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
          active
            ? "bg-[#3b82f6] text-white"
            : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
        }`}
      >
        {label}
        {badge && (
          <span className="ml-1.5 inline-block text-[10px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
      {pill("Monthly", "monthly")}
      {pill("Annual", "annual", "Save 20%")}
    </div>
  );
}
