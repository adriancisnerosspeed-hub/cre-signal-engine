import type { Metadata } from "next";
import Link from "next/link";
import TestimonialCarousel from "@/app/components/TestimonialCarousel";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { getDisplayPlan } from "@/lib/pricingDisplayPlan";
import { getActiveTestimonials } from "@/lib/marketing/testimonials";
import { getSiteUrl } from "@/lib/site";
import PricingClient from "./PricingClient";
import PricingComparisonTable from "./PricingComparisonTable";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description:
    "Plans for underwriting teams deploying real capital — Starter, Analyst, Fund, and Enterprise with governance and benchmark features.",
  openGraph: {
    title: "Pricing — CRE Signal Engine",
    description:
      "Choose a plan aligned with your team: risk governance, benchmarks, portfolio policies, and exports.",
    url: `${getSiteUrl()}/pricing`,
  },
  alternates: {
    canonical: `${getSiteUrl()}/pricing`,
  },
};

export default async function PricingPage() {
  const testimonials = await getActiveTestimonials();
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

  const checkoutAvailable = [
    process.env.STRIPE_PRICE_ID_STARTER,
    process.env.STRIPE_PRICE_ID_ANALYST,
    process.env.STRIPE_PRICE_ID_FUND,
    process.env.STRIPE_PRICE_ID_FOUNDING,
  ].every((v) => typeof v === "string" && v.trim() !== "");

  return (
    <main className="max-w-[780px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <h1 className="text-[28px] font-bold text-gray-900 dark:text-white mb-2">
        CRE Signal Engine — Plans
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Built for underwriting teams deploying real capital.
      </p>

      <section className="mb-10" aria-label="Customer testimonials">
        <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          What operators say
        </h2>
        <TestimonialCarousel testimonials={testimonials} compact />
      </section>

      <div className="flex flex-col gap-6">
        {/* Starter — $97/mo */}
        <section
          className={`p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 border ${displayPlan === "pro" ? "border-2 border-[#3b82f6]" : "border-gray-300 dark:border-zinc-600"}`}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-1">
            Starter
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            $97 / workspace / month
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-[13px] mb-3">
            For individual underwriters and small teams getting started with risk governance.
          </p>
          <ul className="mb-4 pl-5 text-sm text-gray-500 dark:text-gray-400 list-disc">
            <li>
              10 scans / month{" "}
              <span className="text-[12px] text-gray-400 dark:text-zinc-500">
                (Starter workspaces currently receive unlimited scans; pricing copy may update.)
              </span>
            </li>
            <li>Full CRE Signal Risk Index™</li>
            <li>IC-ready PDF export</li>
            <li>Share links</li>
            <li>1 active governance policy</li>
            <li>2 workspace members</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro" checkoutAvailable={checkoutAvailable} />
        </section>

        {/* Analyst — $297/mo */}
        <section
          className="relative p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 border-2 border-[#3b82f6]"
        >
          <div className="absolute -top-3 left-6 bg-[#3b82f6] text-white text-[11px] font-bold py-0.5 px-2.5 rounded uppercase tracking-wider">
            Most Popular
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-1">
            Analyst
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            $297 / workspace / month
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-[13px] mb-3">
            For active underwriting teams who need trajectory, benchmarks, and governance controls.
          </p>
          <ul className="mb-4 pl-5 text-sm text-gray-500 dark:text-gray-400 list-disc">
            <li>Unlimited scans</li>
            <li>Everything in Starter</li>
            <li>Risk score trajectory (over time)</li>
            <li>Benchmark percentiles</li>
            <li>Up to 3 active governance policies</li>
            <li>Up to 5 workspace members</li>
            <li>Governance export packet</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="pro_plus" checkoutAvailable={checkoutAvailable} />
        </section>

        {/* Fund — $797/mo */}
        <section
          className={`p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 border ${displayPlan === "enterprise" ? "border-2 border-[#3b82f6]" : "border-gray-300 dark:border-zinc-600"}`}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-1">
            Fund
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            $797 / workspace / month
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-[13px] mb-3">
            For funds and institutional platforms managing multiple strategies.
          </p>
          <ul className="mb-4 pl-5 text-sm text-gray-500 dark:text-gray-400 list-disc">
            <li>Everything in Analyst</li>
            <li>Custom cohort creation</li>
            <li>Snapshot build control</li>
            <li>Unlimited governance policies</li>
            <li>Up to 10 workspace members</li>
            <li>Contract-level SLA</li>
            <li>Priority support</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="enterprise" checkoutAvailable={checkoutAvailable} />
        </section>

        {/* Enterprise — Custom */}
        <section
          className={`p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 border ${displayPlan === "platform_admin" || displayPlan === "enterprise" ? "border-2 border-[#3b82f6]" : "border border-gray-300 dark:border-zinc-600"}`}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-1">
            Enterprise
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Custom pricing</p>
          <p className="text-gray-500 dark:text-gray-400 text-[13px] mb-3">
            For multi-strategy portfolios requiring API access, custom reporting, and enterprise SLA.
          </p>
          <ul className="mb-4 pl-5 text-sm text-gray-500 dark:text-gray-400 list-disc">
            <li>Everything in Fund</li>
            <li>API access</li>
            <li>Custom reporting</li>
            <li>Unlimited workspace members</li>
            <li>Enterprise SLA</li>
          </ul>
          <PricingClient displayPlan={displayPlan} workspaceId={orgId ?? undefined} slot="enterprise_tier" checkoutAvailable={checkoutAvailable} />
        </section>
      </div>

      {/* Founding Member Banner */}
      <section className="mt-10 py-5 px-6 bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-[15px] font-bold text-amber-500 dark:text-amber-500 mb-1">
              Founding Member Offer
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
              First 20 users get the Analyst tier for{" "}
              <strong className="text-gray-900 dark:text-zinc-200">$147/month, locked for life.</strong>
            </p>
          </div>
          <PricingClient
            displayPlan={displayPlan}
            workspaceId={orgId ?? undefined}
            slot="founding"
            checkoutAvailable={checkoutAvailable}
          />
        </div>
      </section>

      {/* Comparison Table */}
      <PricingComparisonTable />

      {/* Free evaluation note */}
      <section className="mt-4 py-4 px-5 rounded-lg bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600">
        <p className="text-[13px] text-gray-500 dark:text-zinc-400 m-0">
          <strong className="text-gray-600 dark:text-gray-400">Free evaluation:</strong> Sign up free for 3
          lifetime scans — no card required.{" "}
          {!user && (
            <Link href="/login" className="text-[#3b82f6]">
              Start free →
            </Link>
          )}
          {user && displayPlan === "free" && (
            <span className="text-gray-500 dark:text-zinc-400">You are on the free plan.</span>
          )}
        </p>
      </section>

      <section className="mt-10 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          Why $297 / Month Is Operational Insurance
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-[15px] leading-relaxed">
          A single underwriting miss can cost six or seven figures. CRE Signal Engine enforces
          structural consistency, benchmark comparability, and portfolio-level guardrails. For
          institutional operators, governance discipline is not optional.
        </p>
      </section>

      <p className="mt-8">
        <Link href="/" className="text-[#3b82f6] text-sm">
          Back to home
        </Link>
      </p>
    </main>
  );
}
