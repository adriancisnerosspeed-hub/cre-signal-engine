import Link from "next/link";
import LandingCta from "./components/LandingCta";

/** Public landing page. No server-side auth — renders fully with no cookies for bots / Stripe verification. */
export default function LandingPage() {
  return (
    <main className="landing">
      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-hero-title">
          Institutional Risk Governance for Commercial Real Estate.
        </h1>
        <p className="landing-hero-tagline">
          CRE Signal Engine transforms deal assumptions into deterministic risk scores, frozen benchmark percentiles, and enforceable portfolio policies — versioned, auditable, and IC-ready.
        </p>
        <LandingCta />
      </section>

      {/* What This Is */}
      <section className="landing-section">
        <h2 className="landing-section-title">A Risk Governance Layer — Not a Scoring Gadget.</h2>
        <p className="landing-section-intro" style={{ marginBottom: 16 }}>
          CRE Signal Engine is designed for underwriting teams and capital allocators who require defensibility, consistency, and auditability.
        </p>
        <p style={{ marginBottom: 8, color: "var(--muted-foreground, #a1a1aa)", fontSize: 15, lineHeight: 1.6 }}>
          It provides:
        </p>
        <ul className="landing-bullets" style={{ marginBottom: 16, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>A deterministic Risk Index™ (Institutional Stable)</li>
          <li>Snapshot-based cohort benchmarking</li>
          <li>Portfolio-level governance policies</li>
          <li>Versioned exports and audit-ready documentation</li>
        </ul>
        <p style={{ color: "var(--muted-foreground, #a1a1aa)", fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
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
        <ul className="landing-bullets" style={{ marginBottom: 12, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Not an AI opinion engine</li>
          <li>Not a black-box model</li>
          <li>Not a replacement for underwriting judgment</li>
        </ul>
        <p style={{ color: "var(--muted-foreground, #a1a1aa)", fontSize: 15, lineHeight: 1.6 }}>
          Final investment decisions remain human.
          <br />
          CRE Signal Engine structures and governs the risk conversation.
        </p>
      </section>

      {/* How It Works */}
      <section className="landing-section">
        <h2 className="landing-section-title">How It Works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <span className="landing-step-num">1</span>
            <h3 className="landing-step-title">Standardize</h3>
            <p className="landing-step-desc">
              Upload or input deal assumptions. Normalize percent fields. Lock scoring version.
            </p>
          </div>
          <div className="landing-step">
            <span className="landing-step-num">2</span>
            <h3 className="landing-step-title">Score</h3>
            <p className="landing-step-desc">
              Compute deterministic Risk Index™ with explainability and tier controls.
            </p>
          </div>
          <div className="landing-step">
            <span className="landing-step-num">3</span>
            <h3 className="landing-step-title">Benchmark</h3>
            <p className="landing-step-desc">
              Compare against frozen cohort snapshots using midrank percentile methodology.
            </p>
          </div>
          <div className="landing-step">
            <span className="landing-step-num">4</span>
            <h3 className="landing-step-title">Govern</h3>
            <p className="landing-step-desc">
              Apply portfolio-level risk policies and monitor violations over time.
            </p>
          </div>
        </div>
      </section>

      {/* Institutional Output Example */}
      <section className="landing-section">
        <h2 className="landing-section-title">Institutional Output Example</h2>
        <div className="landing-signal-mock">
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
        <p style={{ marginTop: 12, color: "var(--muted-foreground, #71717a)", fontSize: 13 }}>
          This shows governance, not AI tagging.
        </p>
      </section>

      {/* Pricing preview */}
      <section className="landing-section">
        <h2 className="landing-section-title">Pricing</h2>
        <div className="landing-pricing">
          <div className="landing-plan">
            <h3 className="landing-plan-name">Free</h3>
            <p className="landing-plan-desc">
              Evaluation and academic use · 3 lifetime full scans · Risk Index™ preview · Limited macro signals · Redacted IC memo
            </p>
            <Link href="/login" className="landing-plan-cta secondary">Get started</Link>
          </div>
          <div className="landing-plan featured">
            <h3 className="landing-plan-name">Pro</h3>
            <p className="landing-plan-desc">
              Institutional Workspace · Unlimited scans · Full Risk Index™ · Snapshot benchmarking · Portfolio dashboard · 1 governance policy · IC-ready export
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
