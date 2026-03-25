/**
 * Stripe price ID → workspace plan mapping for webhook.
 * Single source of truth; unknown price_id must not change plan.
 * Supports both monthly and annual price IDs mapping to the same plan slugs.
 */

export type WebhookPlan = "FREE" | "PRO" | "PRO+" | "ENTERPRISE";

export function planFromPriceId(priceId: string | null): WebhookPlan | null {
  if (!priceId) return null;
  // Monthly
  const fund = process.env.STRIPE_PRICE_ID_FUND ?? "";
  const analyst = process.env.STRIPE_PRICE_ID_ANALYST ?? "";
  const starter = process.env.STRIPE_PRICE_ID_STARTER ?? "";
  const founding = process.env.STRIPE_PRICE_ID_FOUNDING ?? "";
  // Annual
  const fundAnnual = process.env.STRIPE_FUND_ANNUAL_PRICE_ID ?? "";
  const analystAnnual = process.env.STRIPE_ANALYST_ANNUAL_PRICE_ID ?? "";
  const starterAnnual = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "";
  const foundingAnnual = process.env.STRIPE_FOUNDING_ANNUAL_PRICE_ID ?? "";

  if (fund && priceId === fund) return "ENTERPRISE";
  if (fundAnnual && priceId === fundAnnual) return "ENTERPRISE";
  if (analyst && priceId === analyst) return "PRO+";
  if (analystAnnual && priceId === analystAnnual) return "PRO+";
  if (founding && priceId === founding) return "PRO+";
  if (foundingAnnual && priceId === foundingAnnual) return "PRO+";
  if (starter && priceId === starter) return "PRO";
  if (starterAnnual && priceId === starterAnnual) return "PRO";
  return null;
}
