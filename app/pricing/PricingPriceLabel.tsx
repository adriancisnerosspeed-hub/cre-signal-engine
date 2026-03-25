"use client";

import { useBillingInterval } from "./BillingIntervalContext";
import { PRICING } from "@/lib/pricingConfig";

export default function PricingPriceLabel({
  plan,
}: {
  plan: "starter" | "analyst" | "fund" | "founding";
}) {
  const { interval } = useBillingInterval();
  const cfg = PRICING[plan];

  if (interval === "annual") {
    if (plan === "founding") {
      return (
        <>
          <span>${cfg.annualMonthly}/mo billed annually &mdash; ${cfg.annualTotal}/yr</span>
          <span className="ml-2 inline-block text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
            Lock in founding rate
          </span>
        </>
      );
    }
    return (
      <>
        <span>${cfg.annualMonthly}/mo billed annually</span>
        <span className="ml-2 inline-block text-[10px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
          Save 20%
        </span>
      </>
    );
  }

  return <span>${cfg.monthly} / workspace / month</span>;
}
