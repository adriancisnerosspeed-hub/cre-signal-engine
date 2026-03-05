/**
 * Stripe price ID → workspace plan mapping for webhook.
 * Single source of truth; unknown price_id must not change plan.
 */

export type WebhookPlan = "FREE" | "PRO" | "PRO+" | "ENTERPRISE";

export function planFromPriceId(priceId: string | null): WebhookPlan | null {
  if (!priceId) return null;
  const fund = process.env.STRIPE_PRICE_ID_FUND ?? "";
  const analyst = process.env.STRIPE_PRICE_ID_ANALYST ?? "";
  const starter = process.env.STRIPE_PRICE_ID_STARTER ?? "";
  const founding = process.env.STRIPE_PRICE_ID_FOUNDING ?? "";
  if (fund && priceId === fund) return "ENTERPRISE";
  if (analyst && priceId === analyst) return "PRO+";
  if (founding && priceId === founding) return "PRO+";
  if (starter && priceId === starter) return "PRO";
  return null;
}
