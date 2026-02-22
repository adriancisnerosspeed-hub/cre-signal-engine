/**
 * Routes that must remain public (no auth required, no redirect to login).
 * Used for Stripe verification, bots, and unauthenticated visitors.
 *
 * Do NOT add auth middleware that redirects these paths.
 * Ensure Vercel Deployment Protection / Password Protection is OFF for production.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/login",
  "/terms",
  "/privacy",
  "/auth/callback",
] as const;

/** API routes that must be public (e.g. Stripe webhook cannot send auth cookies). */
export const PUBLIC_API_ROUTES = ["/api/stripe/webhook"] as const;

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))) return true;
  return PUBLIC_ROUTES.some((r) => r === pathname || pathname.startsWith(r + "/"));
}
