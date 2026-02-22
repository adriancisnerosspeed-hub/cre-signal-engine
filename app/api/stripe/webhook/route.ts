import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe_webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    console.warn("[stripe_webhook] Missing stripe-signature");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[stripe_webhook] Signature verification failed", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        let userId = session.metadata?.user_id as string | undefined;
        const customerId = session.customer as string;
        if (customerId && userId) {
          await supabase.from("stripe_customers").upsert(
            { user_id: userId, stripe_customer_id: customerId },
            { onConflict: "user_id" }
          );
          console.log("[stripe_webhook] checkout.session.completed", { user_id: userId });
        }
        if (session.subscription) {
          const stripeSub = await getStripe().subscriptions.retrieve(session.subscription as string);
          const subUserId = userId || stripeSub.metadata?.user_id;
          if (subUserId) {
            await upsertSubscription(supabase, subUserId, stripeSub);
            await setProfilePlanFromSubscription(supabase, subUserId, stripeSub.status);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (userId) {
          await upsertSubscription(supabase, userId, sub);
          await setProfilePlanFromSubscription(supabase, userId, sub.status);
          console.log("[stripe_webhook] subscription updated", { user_id: userId, status: sub.status });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        let userId = sub.metadata?.user_id as string | undefined;
        if (!userId) {
          const { data: row } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          userId = row?.user_id;
        }
        if (userId) {
          await supabase
            .from("subscriptions")
            .update({
              status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", sub.id);
          await supabase.from("profiles").update({ role: "free" }).eq("id", userId);
          console.log("[stripe_webhook] subscription deleted", { user_id: userId });
        }
        break;
      }
      default:
        console.log("[stripe_webhook] unhandled", event.type);
    }
  } catch (e) {
    console.error("[stripe_webhook] handler error", e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function upsertSubscription(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  sub: Stripe.Subscription
) {
  const periodEndTs = sub.items?.data?.[0]?.current_period_end;
  const periodEnd = periodEndTs
    ? new Date(periodEndTs * 1000).toISOString()
    : null;
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
      status: sub.status,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
}

async function setProfilePlanFromSubscription(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  status: string
) {
  const plan = status === "active" || status === "trialing" ? "pro" : "free";
  const { error } = await supabase.from("profiles").update({ role: plan }).eq("id", userId);
  if (error) console.error("[stripe_webhook] profile update failed", error);
}
