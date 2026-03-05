/**
 * Stripe price ID → workspace plan mapping for webhook.
 * Single source of truth; unknown price_id must not change plan.
 */

export type WebhookPlan = "FREE" | "PRO" | "PRO+" | "ENTERPRISE";

export function planFromPriceId(priceId: string | null): WebhookPlan | null {
  if (!priceId) return null;
  const enterprise = process.env.STRIPE_PRICE_ID_ENTERPRISE ?? "";
  const proPlus = process.env.STRIPE_PRICE_ID_PRO_PLUS ?? "";
  const pro = process.env.STRIPE_PRICE_ID_PRO ?? "";
  const founding = process.env.STRIPE_PRICE_ID_FOUNDING ?? "";
  if (enterprise && priceId === enterprise) return "ENTERPRISE";
  if (proPlus && priceId === proPlus) return "PRO+";
  if (founding && priceId === founding) return "PRO+";
  if (pro && priceId === pro) return "PRO";
  return null;
}
