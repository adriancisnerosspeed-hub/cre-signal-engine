import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripe = new Stripe(key);
  }
  return stripe;
}

/** Get or create Stripe customer for user. Uses stripe_customers table; creates in Stripe if missing. */
export async function getOrCreateStripeCustomerId(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<string> {
  const { data: row } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const st = getStripe();
  const customer = await st.customers.create({ email });
  await supabase.from("stripe_customers").insert({
    user_id: userId,
    stripe_customer_id: customer.id,
  });
  return customer.id;
}

/** Get or create Stripe customer for organization (workspace). Stores stripe_customer_id on organizations. */
export async function getOrCreateStripeCustomerIdForOrg(
  supabase: SupabaseClient,
  orgId: string,
  email?: string
): Promise<string> {
  const { data: row } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .maybeSingle();

  const existing = (row as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (existing) return existing;

  const st = getStripe();
  const customer = await st.customers.create({
    email: email ?? undefined,
    metadata: { workspace_id: orgId },
  });
  await supabase
    .from("organizations")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  return customer.id;
}
