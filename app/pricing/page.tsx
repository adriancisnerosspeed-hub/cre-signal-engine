import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { getDisplayPlan } from "@/lib/pricingDisplayPlan";
import PricingClient from "./PricingClient";
import PricingComparisonTable from "./PricingComparisonTable";

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
    <main style={{ maxWidth: 780, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        CRE Signal Engine — Plans
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 32 }}>
        Built for underwriting teams deploying real capital.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Starter — $97/mo */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: displayPlan === "pro" ? "2px solid #3b82f6" : "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Starter
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
            $97 / workspace / month
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            For individual underwriters and small teams getting started with risk governance.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>10 scans / month</li>
            <li>Full CRE Signal Risk Index™</li>
            <li>IC-ready PDF export</li>
            <li>Share links</li>
            <li>1 active governance policy</li>
            <li>2 workspace members</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro" />
        </section>

        {/* Analyst — $297/mo */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: displayPlan === "pro_plus" ? "2px solid #3b82f6" : "2px solid #3b82f6",
            borderRadius: 12,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -12,
              left: 24,
              backgroundColor: "#3b82f6",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 4,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Most Popular
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Analyst
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
            $297 / workspace / month
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            For active underwriting teams who need trajectory, benchmarks, and governance controls.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Unlimited scans</li>
            <li>Everything in Starter</li>
            <li>Risk score trajectory (over time)</li>
            <li>Benchmark percentiles</li>
            <li>Up to 3 active governance policies</li>
            <li>Up to 5 workspace members</li>
            <li>Governance export packet</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro_plus" />
        </section>

        {/* Fund — $797/mo */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border:
              displayPlan === "platform_admin" || displayPlan === "enterprise"
                ? "2px solid #3b82f6"
                : "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Fund
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
            $797 / workspace / month
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            For funds and institutional platforms managing multiple strategies.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Everything in Analyst</li>
            <li>Custom cohort creation</li>
            <li>Snapshot build control</li>
            <li>Unlimited governance policies</li>
            <li>Up to 10 workspace members</li>
            <li>Contract-level SLA</li>
            <li>Priority support</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="enterprise" />
        </section>

        {/* Enterprise — Custom */}
        <section
          style={{
            padding: 24,
            backgroundColor: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>
            Enterprise
          </h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>Custom pricing</p>
          <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
            For multi-strategy portfolios requiring API access, custom reporting, and enterprise SLA.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "#a1a1aa" }}>
            <li>Everything in Fund</li>
            <li>API access</li>
            <li>Custom reporting</li>
            <li>Unlimited workspace members</li>
            <li>Enterprise SLA</li>
          </ul>
          <a
            href="mailto:sales@cresignalengine.com"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Contact sales
          </a>
        </section>
      </div>

      {/* Founding Member Banner */}
      <section
        style={{
          marginTop: 40,
          padding: "20px 24px",
          backgroundColor: "rgba(234,179,8,0.08)",
          border: "1px solid rgba(234,179,8,0.3)",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#eab308", marginBottom: 4 }}>
              Founding Member Offer
            </p>
            <p style={{ fontSize: 14, color: "#a1a1aa", margin: 0 }}>
              First 20 users get the Analyst tier for{" "}
              <strong style={{ color: "#e4e4e7" }}>$147/month, locked for life.</strong>
            </p>
          </div>
          <PricingClient
            displayPlan={displayPlan}
            workspaceId={orgId ?? undefined}
            slot="founding"
          />
        </div>
      </section>

      {/* Comparison Table */}
      <PricingComparisonTable />

      {/* Free evaluation note */}
      <section
        style={{
          marginTop: 16,
          padding: "16px 20px",
          backgroundColor: "#18181b",
          border: "1px solid #3f3f46",
          borderRadius: 10,
        }}
      >
        <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
          <strong style={{ color: "#a1a1aa" }}>Free evaluation:</strong> Sign up free for 3
          lifetime scans — no card required.{" "}
          {!user && (
            <Link href="/login" style={{ color: "#3b82f6" }}>
              Start free →
            </Link>
          )}
          {user && displayPlan === "free" && (
            <span style={{ color: "#71717a" }}>You are on the free plan.</span>
          )}
        </p>
      </section>

      <section style={{ marginTop: 40, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Why $297 / Month Is Operational Insurance
        </h2>
        <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6 }}>
          A single underwriting miss can cost six or seven figures. CRE Signal Engine enforces
          structural consistency, benchmark comparability, and portfolio-level guardrails. For
          institutional operators, governance discipline is not optional.
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
