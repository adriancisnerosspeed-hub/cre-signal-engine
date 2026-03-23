/**
 * Canonical public site origin for metadata, sitemap, and OG URLs.
 * Prefer NEXT_PUBLIC_APP_URL in production (see auth callback).
 */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (fromEnv && fromEnv.startsWith("http")) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
