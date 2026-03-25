/**
 * Determine billing interval from a Stripe price ID by checking against annual env vars.
 */
export function getBillingInterval(stripePriceId: string | null): "monthly" | "annual" | null {
  if (!stripePriceId) return null;
  const annualIds = [
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    process.env.STRIPE_ANALYST_ANNUAL_PRICE_ID,
    process.env.STRIPE_FUND_ANNUAL_PRICE_ID,
    process.env.STRIPE_FOUNDING_ANNUAL_PRICE_ID,
  ].filter(Boolean);
  if (annualIds.includes(stripePriceId)) return "annual";
  return "monthly";
}
