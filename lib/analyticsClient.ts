"use client";

import posthog from "posthog-js";

export function captureClientEvent(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // no-op
  }
}

export function identifyAnalyticsUser(
  userId: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.identify(userId, properties);
  } catch {
    // no-op
  }
}
