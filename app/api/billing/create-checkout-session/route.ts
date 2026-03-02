import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getStripe, getOrCreateStripeCustomerIdForOrg } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: string; workspace_id?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const plan = body.plan === "ENTERPRISE" ? "ENTERPRISE" : "PRO";
  let workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : null;
  if (!workspaceId) {
    workspaceId = await getCurrentOrgId(supabase, user);
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organizations")
    .select("id")
    .eq("id", workspaceId)
    .single();
  if (!org) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const priceId =
    plan === "ENTERPRISE"
      ? process.env.STRIPE_PRICE_ID_ENTERPRISE
      : process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) {
    return NextResponse.json({ error: "Stripe not configured for this plan" }, { status: 500 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const successUrl = `${baseUrl}/settings?upgraded=1`;
  const cancelUrl = `${baseUrl}/pricing`;

  try {
    const customerId = await getOrCreateStripeCustomerIdForOrg(service, workspaceId, user.email);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { workspace_id: workspaceId },
      subscription_data: { metadata: { workspace_id: workspaceId } },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
