import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { planFromPriceId } from "@/lib/stripeWebhookPlan";

/** Resolve organization id from subscription: metadata.workspace_id, or org by stripe_subscription_id, or org by stripe_customer_id. */
async function resolveOrgIdFromSubscription(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  sub: Stripe.Subscription
): Promise<string | null> {
  const workspaceId = sub.metadata?.workspace_id as string | undefined;
  if (workspaceId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (org) return workspaceId;
  }

  const { data: bySub } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (bySub) return (bySub as { id: string }).id;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const { data: byCustomer } = await supabase
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer) return (byCustomer as { id: string }).id;
  }

  return null;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe_webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[stripe_webhook] Signature verification failed", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id as string | undefined;
        const customerId = session.customer as string;
        if (customerId && workspaceId) {
          await supabase
            .from("organizations")
            .update({
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", workspaceId);
        }
        if (session.subscription) {
          const stripeSub = await getStripe().subscriptions.retrieve(session.subscription as string);
          const orgId = await resolveOrgIdFromSubscription(supabase, stripeSub);
          if (orgId) {
            await updateOrgFromSubscription(supabase, orgId, stripeSub, event.id);
          } else {
            await recordUnmatchedEvent(supabase, event, stripeSub.id, customerId, "no_matching_org");
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrgIdFromSubscription(supabase, sub);
        if (orgId) {
          await updateOrgFromSubscription(supabase, orgId, sub, event.id);
        } else {
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
          await recordUnmatchedEvent(supabase, event, sub.id, customerId, "no_matching_org");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrgIdFromSubscription(supabase, sub);
        if (orgId) {
          const { data: before } = await supabase
            .from("organizations")
            .select("plan, billing_status")
            .eq("id", orgId)
            .single();
          await supabase.from("billing_audit_log").insert({
            org_id: orgId,
            event_id: event.id,
            old_plan: (before as { plan?: string } | null)?.plan ?? null,
            new_plan: "FREE",
            old_status: (before as { billing_status?: string } | null)?.billing_status ?? null,
            new_status: "canceled",
          });
          await supabase
            .from("organizations")
            .update({
              plan: "FREE",
              billing_status: "canceled",
              stripe_subscription_id: null,
              stripe_price_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", orgId);
        } else {
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
          await recordUnmatchedEvent(supabase, event, sub.id, customerId, "no_matching_org");
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe_webhook] handler error", e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  await supabase.from("stripe_webhook_events").insert({
    event_id: event.id,
    processed_at: new Date().toISOString(),
  });
  return NextResponse.json({ received: true });
}

/**
 * Policy: trialing | active | past_due ⇒ keep plan from price (PRO/ENTERPRISE).
 * Only canceled/deleted ⇒ FREE. past_due must not remove entitlements.
 */
async function updateOrgFromSubscription(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  orgId: string,
  sub: Stripe.Subscription,
  eventId: string
) {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const resolvedPlan = planFromPriceId(priceId);

  // Diagnostic logging: remove after confirming plan update (price ID vs env)
  const envFund = process.env.STRIPE_PRICE_ID_FUND ?? "";
  const envAnalyst = process.env.STRIPE_PRICE_ID_ANALYST ?? "";
  const envStarter = process.env.STRIPE_PRICE_ID_STARTER ?? "";
  const envFounding = process.env.STRIPE_PRICE_ID_FOUNDING ?? "";
  console.log("[stripe_webhook] Webhook price ID:", priceId);
  console.log("[stripe_webhook] Matched plan slug:", resolvedPlan ?? "no match");
  console.log("[stripe_webhook] ENV price IDs (last 6 chars):", {
    FUND: envFund ? envFund.slice(-6) : "(unset)",
    ANALYST: envAnalyst ? envAnalyst.slice(-6) : "(unset)",
    STARTER: envStarter ? envStarter.slice(-6) : "(unset)",
    FOUNDING: envFounding ? envFounding.slice(-6) : "(unset)",
  });

  const billingStatus =
    sub.status === "active" || sub.status === "trialing"
      ? sub.status
      : sub.status === "past_due"
        ? "past_due"
        : sub.status === "canceled" || sub.status === "unpaid"
          ? "canceled"
          : "inactive";

  // Audit unknown or missing price for visibility (diagnose config mistakes without reading logs)
  if (priceId != null && resolvedPlan == null) {
    await supabase.from("stripe_webhook_audit").insert({
      event_id: eventId,
      event_type: "customer.subscription.created/updated",
      subscription_id: sub.id,
      customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      metadata_json: { price_id: priceId },
      reason: "unknown_price_id",
    });
  }
  if (priceId == null) {
    await supabase.from("stripe_webhook_audit").insert({
      event_id: eventId,
      event_type: "customer.subscription.created/updated",
      subscription_id: sub.id,
      customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      metadata_json: {},
      reason: "missing_price_id",
    });
  }

  if (priceId != null && resolvedPlan == null) {
    // Do not change plan when price_id is unknown; only update subscription identifiers and status
    const { data: before } = await supabase
      .from("organizations")
      .select("plan, billing_status")
      .eq("id", orgId)
      .single();
    const updates: Record<string, unknown> = {
      billing_status: billingStatus,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      updated_at: new Date().toISOString(),
    };
    if (before && (before as { billing_status?: string }).billing_status !== billingStatus) {
      await supabase.from("billing_audit_log").insert({
        org_id: orgId,
        event_id: eventId,
        old_plan: (before as { plan?: string }).plan ?? null,
        new_plan: (before as { plan?: string }).plan ?? null,
        old_status: (before as { billing_status?: string }).billing_status ?? null,
        new_status: billingStatus,
      });
    }
    await supabase.from("organizations").update(updates).eq("id", orgId);
    return;
  }

  const plan =
    billingStatus === "canceled" || billingStatus === "inactive"
      ? "FREE"
      : resolvedPlan ?? "FREE";

  const { data: before } = await supabase
    .from("organizations")
    .select("plan, billing_status")
    .eq("id", orgId)
    .single();
  const oldPlan = (before as { plan?: string } | null)?.plan ?? null;
  const oldStatus = (before as { billing_status?: string } | null)?.billing_status ?? null;
  if (oldPlan !== plan || oldStatus !== billingStatus) {
    await supabase.from("billing_audit_log").insert({
      org_id: orgId,
      event_id: eventId,
      old_plan: oldPlan,
      new_plan: plan,
      old_status: oldStatus,
      new_status: billingStatus,
    });
  }

  const updates: Record<string, unknown> = {
    plan,
    billing_status: billingStatus,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    updated_at: new Date().toISOString(),
  };
  if (billingStatus === "active" || billingStatus === "trialing") {
    updates.plan_activated_at = new Date().toISOString();
  }
  const { error: updateError } = await supabase.from("organizations").update(updates).eq("id", orgId);
  console.log("[stripe_webhook] Database update result:", updateError ? { error: updateError.message } : { ok: true, plan: updates.plan });
}

async function recordUnmatchedEvent(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  event: Stripe.Event,
  subscriptionId: string | null,
  customerId: string | null,
  reason: string
) {
  await supabase.from("stripe_webhook_audit").insert({
    event_id: event.id,
    event_type: event.type,
    subscription_id: subscriptionId,
    customer_id: customerId,
    metadata_json: event.data?.object ? (event.data.object as unknown as Record<string, unknown>) : {},
    reason,
  });
}
