import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe first." },
      { status: 400 }
    );
  }

  // Use root domain only (e.g. https://yourdomain.com) for Stripe return URL.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const returnUrl = `${baseUrl}/settings`;

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
