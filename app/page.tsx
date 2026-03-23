import type { Metadata } from "next";
import Link from "next/link";
import DemoSnapshotForm from "./components/DemoSnapshotForm";
import LandingCta from "./components/LandingCta";
import TestimonialCarousel from "./components/TestimonialCarousel";
import { getActiveTestimonials } from "@/lib/marketing/testimonials";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Institutional CRE Risk Governance",
  description:
    "Deterministic Risk Index, snapshot cohort benchmarks, portfolio governance policies, and versioned IC-ready exports for underwriting teams.",
  openGraph: {
    title: "CRE Signal Engine — Institutional CRE Risk Governance",
    description:
      "Transform deal assumptions into deterministic risk scores, frozen benchmark percentiles, and enforceable portfolio policies.",
    url: getSiteUrl(),
  },
  alternates: {
    canonical: getSiteUrl(),
  },
};

/** Public landing page. No server-side auth — renders fully with no cookies for bots / Stripe verification. */
export default async function LandingPage() {
  const testimonials = await getActiveTestimonials();

  return (
    <main className="landing landing-premium">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 md:px-6 md:pb-14 md:pt-16">
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2 md:justify-start lg:justify-center">
          {["Audit-Ready", "Versioned", "Deterministic"].map((label) => (
            <span
              key={label}
              className="rounded-full border border-zinc-600/80 bg-zinc-900/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 ring-1 ring-white/5"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="text-center lg:text-left">
            <h1 className="landing-hero-title text-balance text-zinc-50">
              Institutional Risk Governance for Commercial Real Estate.
            </h1>
            <p className="landing-hero-tagline text-pretty text-zinc-400">
              CRE Signal Engine transforms deal assumptions into deterministic risk scores, frozen
              benchmark percentiles, and enforceable portfolio policies — versioned, auditable, and
              IC-ready.
            </p>
            <LandingCta />
          </div>
          <DemoSnapshotForm className="w-full max-w-md justify-self-center lg:max-w-none lg:justify-self-end" />
        </div>
      </section>

      {/* What This Is */}
      <section className="landing-section">
        <h2 className="landing-section-title">A Risk Governance Layer — Not a Scoring Gadget.</h2>
        <p className="mb-4 text-center text-[15px] leading-relaxed text-zinc-400">
          CRE Signal Engine is designed for underwriting teams and capital allocators who require
          defensibility, consistency, and auditability.
        </p>
        <p className="mb-2 text-center text-sm text-zinc-500">It provides:</p>
        <ul className="landing-bullets mb-4 list-disc pl-5 text-left text-[15px] leading-relaxed text-zinc-300 md:mx-auto md:max-w-xl">
          <li>A deterministic Risk Index™ (Institutional Stable)</li>
          <li>Snapshot-based cohort benchmarking</li>
          <li>Portfolio-level governance policies</li>
          <li>Versioned exports and audit-ready documentation</li>
        </ul>
        <p className="text-center text-sm italic leading-relaxed text-zinc-500">
          Every score references a methodology version.
          <br />
          Every percentile references a frozen cohort snapshot.
          <br />
          Every export includes reproducible metadata.
        </p>
      </section>

      {/* What This Is Not */}
      <section className="landing-section">
        <h2 className="landing-section-title">What This Is Not</h2>
        <ul className="landing-bullets mb-3 list-disc pl-5 text-left text-[15px] leading-relaxed text-zinc-300 md:mx-auto md:max-w-xl">
          <li>Not an AI opinion engine</li>
          <li>Not a black-box model</li>
          <li>Not a replacement for underwriting judgment</li>
        </ul>
        <p className="text-center text-[15px] leading-relaxed text-zinc-400">
          Final investment decisions remain human.
          <br />
          CRE Signal Engine structures and governs the risk conversation.
        </p>
      </section>

      {/* How It Works */}
      <section className="landing-section">
        <h2 className="landing-section-title">How It Works</h2>
        <div className="landing-steps">
          <div className="landing-step border-zinc-700/80 bg-zinc-900/40">
            <span className="landing-step-num">1</span>
            <h3 className="landing-step-title">Standardize</h3>
            <p className="landing-step-desc">
              Upload or input deal assumptions. Normalize percent fields. Lock scoring version.
            </p>
          </div>
          <div className="landing-step border-zinc-700/80 bg-zinc-900/40">
            <span className="landing-step-num">2</span>
            <h3 className="landing-step-title">Score</h3>
            <p className="landing-step-desc">
              Compute deterministic Risk Index™ with explainability and tier controls.
            </p>
          </div>
          <div className="landing-step border-zinc-700/80 bg-zinc-900/40">
            <span className="landing-step-num">3</span>
            <h3 className="landing-step-title">Benchmark</h3>
            <p className="landing-step-desc">
              Compare against frozen cohort snapshots using midrank percentile methodology.
            </p>
          </div>
          <div className="landing-step border-zinc-700/80 bg-zinc-900/40">
            <span className="landing-step-num">4</span>
            <h3 className="landing-step-title">Govern</h3>
            <p className="landing-step-desc">
              Apply portfolio-level risk policies and monitor violations over time.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="landing-section border-t border-zinc-800/80">
        <h2 className="landing-section-title">What operators say</h2>
        <p className="mb-8 text-center text-sm text-zinc-500">
          Anonymized case studies from underwriting and capital teams.
        </p>
        <TestimonialCarousel testimonials={testimonials} />
      </section>

      {/* Institutional Output Example */}
      <section className="landing-section">
        <h2 className="landing-section-title">Institutional Output Example</h2>
        <div className="landing-signal-mock border-zinc-700/80 bg-zinc-900/40">
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Risk Index</div>
            <p className="landing-signal-mock-text">62 (Elevated)</p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Cohort Snapshot</div>
            <p className="landing-signal-mock-text">US_OFFICE_V2_2026Q1</p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Percentile</div>
            <p className="landing-signal-mock-text">78th</p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Risk Band</div>
            <p className="landing-signal-mock-text">ELEVATED</p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Delta Comparable</div>
            <p className="landing-signal-mock-text">Yes</p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Policy Status</div>
            <p className="landing-signal-mock-text">WARN (1 violation)</p>
          </div>
        </div>
        <p className="mt-3 text-center text-[13px] text-zinc-500">
          This shows governance, not AI tagging.
        </p>
      </section>

      {/* Pricing preview — matches /pricing plan names and prices */}
      <section className="landing-section">
        <h2 className="landing-section-title">Pricing</h2>
        <div className="landing-pricing max-w-5xl">
          <div className="landing-plan border-zinc-700/80 bg-zinc-900/40">
            <h3 className="landing-plan-name">Free</h3>
            <p className="landing-plan-price">3 lifetime scans</p>
            <p className="landing-plan-desc">
              Evaluation and academic use · Risk Index™ preview · Limited macro signals · Redacted IC
              memo
            </p>
            <Link href="/login" className="landing-plan-cta secondary">
              Get started
            </Link>
          </div>
          <div className="landing-plan border-zinc-700/80 bg-zinc-900/40">
            <h3 className="landing-plan-name">Starter</h3>
            <p className="landing-plan-price">
              $97{" "}
              <span className="text-sm font-normal text-zinc-400">/ workspace / month</span>
            </p>
            <p className="landing-plan-desc">
              10 scans / month · Full Risk Index™ · IC-ready PDF export · 1 governance policy · 2
              workspace members
            </p>
            <Link href="/pricing" className="landing-plan-cta secondary">
              View plans
            </Link>
          </div>
          <div className="landing-plan featured relative border-blue-500/60 bg-zinc-900/40">
            <span className="absolute -top-2.5 left-6 rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              Most popular
            </span>
            <h3 className="landing-plan-name">Analyst</h3>
            <p className="landing-plan-price">
              $297{" "}
              <span className="text-sm font-normal text-zinc-400">/ workspace / month</span>
            </p>
            <p className="landing-plan-desc">
              Unlimited scans · Risk trajectory · Benchmark percentiles · Up to 3 policies · 5 members
              · Governance export packet
            </p>
            <Link href="/pricing" className="landing-plan-cta primary">
              View plans
            </Link>
          </div>
          <div className="landing-plan border-zinc-700/80 bg-zinc-900/40">
            <h3 className="landing-plan-name">Fund · Enterprise</h3>
            <p className="landing-plan-price">
              $797 <span className="text-sm font-normal text-zinc-400">/ mo</span> ·{" "}
              <span className="text-sm font-normal text-zinc-400">Custom</span>
            </p>
            <p className="landing-plan-desc">
              Custom cohorts · Snapshot build · Unlimited policies · API access · Enterprise SLA
            </p>
            <Link href="/pricing" className="landing-plan-cta secondary">
              View plans
            </Link>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="landing-footer-cta border-t border-zinc-800/80">
        <LandingCta />
      </section>

      <footer className="landing-footer border-zinc-800/80">
        <Link href="/sample-report">Sample Report</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </main>
  );
}
