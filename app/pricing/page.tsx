import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlanForUser } from "@/lib/entitlements";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const plan = user ? await getPlanForUser(supabase, user.id) : "free";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Pricing
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 32 }}>
        Choose the plan that fits your workflow.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Free
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16 }}>
            10 analyzes per day · Manual digest (up to 6 signals) · No scheduled digest
          </p>
          {plan === "free" && !user && (
            <Link
              href="/login"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                backgroundColor: "#27272a",
                color: "#e4e4e7",
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in to use Free
            </Link>
          )}
          {plan === "free" && user && (
            <span style={{ color: "#71717a", fontSize: 14 }}>Current plan</span>
          )}
        </section>

        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: "2px solid #3b82f6",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Pro
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16 }}>
            200 analyzes per day · Manual + scheduled digest · Up to 12 signals per email
          </p>
          <PricingClient plan={plan} />
        </section>
      </div>

      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: "#3b82f6", fontSize: 14 }}>
          Back to home
        </Link>
      </p>
    </main>
  );
}
