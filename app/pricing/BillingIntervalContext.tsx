"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type BillingInterval = "monthly" | "annual";

const BillingIntervalCtx = createContext<{
  interval: BillingInterval;
  setInterval: (v: BillingInterval) => void;
}>({
  interval: "monthly",
  setInterval: () => {},
});

export function BillingIntervalProvider({ children }: { children: ReactNode }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return (
    <BillingIntervalCtx.Provider value={{ interval, setInterval }}>
      {children}
    </BillingIntervalCtx.Provider>
  );
}

export function useBillingInterval() {
  return useContext(BillingIntervalCtx);
}
