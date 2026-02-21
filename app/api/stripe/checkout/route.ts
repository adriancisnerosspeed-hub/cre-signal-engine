import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getStripe, getOrCreateStripeCustomerId } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const successUrl = `${baseUrl.replace(/\/$/, "")}/settings?upgraded=1`;
  const cancelUrl = `${baseUrl.replace(/\/$/, "")}/pricing`;

  try {
    const customerId = await getOrCreateStripeCustomerId(supabase, user.id, user.email);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
