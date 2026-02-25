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
        Underwrite with Institutional Defensibility.
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 32 }}>
        CRE Signal Engine transforms deal memos into structured risk intelligence, macro cross-reference overlays, and IC-ready summaries — in minutes.
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
            FREE — Explore
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>$0</p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>3 lifetime full scans</li>
            <li>Risk Index™ preview</li>
            <li>Limited macro signals</li>
            <li>Redacted IC memo</li>
            <li>7-day history</li>
          </ul>
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
              Start Free
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
            PRO — Institutional
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>$99 / seat / month</p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Unlimited scans</li>
            <li>Full CRE Signal Risk Index™</li>
            <li>Full macro overlay</li>
            <li>IC Memorandum Narrative</li>
            <li>Export-ready PDF</li>
            <li>Scenario comparison</li>
            <li>Risk percentile benchmarking</li>
            <li>Workspace collaboration</li>
            <li>Portfolio dashboard</li>
          </ul>
          <PricingClient plan={plan} />
        </section>
      </div>

      <section style={{ marginTop: 40, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Why $99 Is a Rounding Error
        </h2>
        <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6 }}>
          A single underwriting miss can cost six or seven figures. CRE Signal Engine structures risk intelligence, macro cross-references, and IC-ready narratives into one defensible workflow. For institutional operators, $99/month is operational insurance.
        </p>
      </section>

      <p style={{ marginTop: 24, fontSize: 14, color: "#71717a" }}>
        Built for lenders, operators, and private equity teams deploying real capital.
      </p>

      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: "#3b82f6", fontSize: 14 }}>
          Back to home
        </Link>
      </p>
    </main>
  );
}
