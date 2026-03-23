import { PostHog } from "posthog-node";

/**
 * Server-side analytics (scan completion, exports, auth). No-op when PostHog is not configured.
 * Uses a short-lived client per call so serverless handlers flush reliably.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const key = process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  const posthog = new PostHog(key, { host });
  try {
    posthog.capture({ distinctId, event, properties });
    await posthog.shutdown();
  } catch {
    // analytics must not break primary flows
  }
}
