import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { getDisplayPlan } from "@/lib/pricingDisplayPlan";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profilePlan = user ? await getPlanForUser(supabase, user.id) : "user";
  const orgId = user ? await getCurrentOrgId(supabase, user) : null;

  let workspacePlan: string | null = null;
  if (orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("plan")
      .eq("id", orgId)
      .maybeSingle();
    workspacePlan = (org as { plan?: string } | null)?.plan ?? null;
  }

  const displayPlan = getDisplayPlan(profilePlan, workspacePlan);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Risk Governance Access Levels
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 32 }}>
        Built for underwriting teams deploying real capital.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* FREE — Evaluation */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            FREE — Evaluation
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>$0</p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            Designed for evaluation and academic use.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>3 lifetime full scans</li>
            <li>Risk Index™ preview</li>
            <li>Limited macro signals</li>
            <li>Redacted IC memo</li>
            <li>No benchmark access</li>
            <li>No governance policies</li>
            <li>No export</li>
            <li>1 workspace member (creator only); no collaboration</li>
          </ul>
          {displayPlan === "free" && !user && (
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
              Get Started
            </Link>
          )}
          {displayPlan === "free" && user && (
            <span style={{ color: "#71717a", fontSize: 14 }}>Current plan</span>
          )}
        </section>

        {/* PRO — Institutional Workspace */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: displayPlan === "pro" ? "2px solid #3b82f6" : "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            PRO — Institutional Workspace
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
            $299 / workspace / month
          </p>
          <p style={{ color: "#71717a", fontSize: 13, marginBottom: 8 }}>
            Annual: $2,988 / year — 15% savings
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            Designed for active underwriting teams.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Unlimited scans</li>
            <li>Full CRE Signal Risk Index™ (Institutional Stable)</li>
            <li>Snapshot-based benchmark percentiles</li>
            <li>Portfolio dashboard &amp; risk movement tracking</li>
            <li>1 active governance policy</li>
            <li>IC-ready PDF export</li>
            <li>Support bundle export (audit artifacts)</li>
            <li>Up to 5 workspace members</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro" />
        </section>

        {/* PRO+ — Advanced governance */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: displayPlan === "pro_plus" ? "2px solid #3b82f6" : "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            PRO+ — Advanced governance
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
            $499 / workspace / month
          </p>
          <p style={{ color: "#71717a", fontSize: 13, marginBottom: 8 }}>
            Annual: $4,988 / year — 15% savings
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            Risk trajectory, governance export, and higher member and policy limits.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Everything in PRO</li>
            <li>Up to 10 workspace members</li>
            <li>Up to 3 active governance policies</li>
            <li>Risk score trajectory (over time)</li>
            <li>Governance export packet</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro_plus" />
        </section>

        {/* ENTERPRISE — Portfolio Infrastructure */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: displayPlan === "platform_admin" || displayPlan === "enterprise" ? "2px solid #3b82f6" : "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            ENTERPRISE — Portfolio Infrastructure
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>Custom pricing</p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            Designed for institutional portfolios and multi-strategy platforms.
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 8 }}>Includes everything in PRO, plus:</p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Custom cohort creation</li>
            <li>Snapshot build control</li>
            <li>Multiple active governance policies (unlimited)</li>
            <li>Unlimited workspace members</li>
            <li>API access</li>
            <li>Custom reporting</li>
            <li>Priority support</li>
            <li>Contract-level SLA</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="enterprise" />
        </section>
      </div>

      <section style={{ marginTop: 40, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Why $299 / Month Is Operational Insurance
        </h2>
        <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6 }}>
          A single underwriting miss can cost six or seven figures.
          CRE Signal Engine enforces structural consistency, benchmark comparability, and portfolio-level guardrails.
          For institutional operators, governance discipline is not optional.
        </p>
      </section>

      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: "#3b82f6", fontSize: 14 }}>
          Back to home
        </Link>
      </p>
    </main>
  );
}
