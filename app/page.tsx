import Link from "next/link";
import LandingCta from "./components/LandingCta";

/** Public landing page. No server-side auth — renders fully with no cookies for bots / Stripe verification. */
export default function LandingPage() {
  return (
    <main className="landing">
      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-hero-title">
          Turn raw CRE inputs into structured, actionable signals
        </h1>
        <p className="landing-hero-tagline">
          CRE Signal Engine turns raw commercial real estate inputs into structured actionable signals.
        </p>
        <LandingCta />
      </section>

      {/* How it works */}
      <section className="landing-section">
        <h2 className="landing-section-title">How it works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <span className="landing-step-num">1</span>
            <h3 className="landing-step-title">Analyze</h3>
            <p className="landing-step-desc">
              Paste your CRE notes, emails, or updates. We extract structured signals with action, confidence, and impact.
            </p>
          </div>
          <div className="landing-step">
            <span className="landing-step-num">2</span>
            <h3 className="landing-step-title">Signals</h3>
            <p className="landing-step-desc">
              Each signal is tagged (Act / Monitor / Track), with &quot;What changed,&quot; &quot;Why it matters,&quot; and &quot;Who this affects.&quot;
            </p>
          </div>
          <div className="landing-step">
            <span className="landing-step-num">3</span>
            <h3 className="landing-step-title">Digest</h3>
            <p className="landing-step-desc">
              Build a manual digest or schedule a recurring email so you never miss what matters.
            </p>
          </div>
        </div>
      </section>

      {/* Example signal card mock */}
      <section className="landing-section">
        <h2 className="landing-section-title">Example signal</h2>
        <div className="landing-signal-mock">
          <div className="landing-signal-mock-tags">
            <span className="landing-signal-tag type">Lease / Deal</span>
            <span className="landing-signal-tag act">Act</span>
            <span className="landing-signal-tag conf">High</span>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">What changed</div>
            <p className="landing-signal-mock-text">
              Anchor tenant signed 10-year renewal; landlord agreed to cap annual escalations at 2.5%.
            </p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Why it matters</div>
            <p className="landing-signal-mock-text">
              Stabilizes NOI and reduces re-leasing risk for the next cycle. Comparable deals may follow.
            </p>
          </div>
          <div className="landing-signal-mock-block">
            <div className="landing-signal-mock-label">Who this affects</div>
            <p className="landing-signal-mock-text">
              Asset managers, lenders, and tenants in the same submarket.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="landing-section">
        <h2 className="landing-section-title">Pricing</h2>
        <div className="landing-pricing">
          <div className="landing-plan">
            <h3 className="landing-plan-name">Free</h3>
            <p className="landing-plan-desc">
              10 signal analyzes per day · 2 deal scans per day · Manual digest (up to 6 signals) · No scheduled digest · Single user
            </p>
            <Link href="/login" className="landing-plan-cta secondary">Get started</Link>
          </div>
          <div className="landing-plan featured">
            <h3 className="landing-plan-name">Pro</h3>
            <p className="landing-plan-desc">
              200 signal analyzes per day · 50 deal scans per day · Manual + scheduled digest (up to 12 signals) · IC memorandum narrative · Export · Invite team &amp; workspaces
            </p>
            <Link href="/login" className="landing-plan-cta primary">
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="landing-footer-cta">
        <LandingCta />
      </section>

      <footer className="landing-footer">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </main>
  );
}
