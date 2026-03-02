import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  title,
  version,
  publishedAt,
  sections,
  disclaimerLines,
  type MethodologySection,
} from "@/lib/methodology/methodologyContent";
import MethodologyDownloadButton from "./MethodologyDownloadButton";

export default async function MethodologyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await ensureProfile(supabase, user);

  const entitlements = await getEntitlementsForUser(supabase, user.id);
  const scanExportEnabled = entitlements.scan_export_enabled;

  const defaultFilename = `cre-signal-risk-index-methodology-v${version}.pdf`;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        CRE Signal Risk Index™
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        Version {version} — Institutional Stable
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16 }}>
        This methodology is versioned and locked for determinism.
      </p>
      <ul style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Scores do not change retroactively.</li>
        <li>Percentiles reference frozen cohort snapshots.</li>
        <li>Delta comparability is enforced across versions.</li>
        <li>Stability guarantees are test-covered.</li>
      </ul>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 8 }}>
        Published: {publishedAt}
      </p>
      <p style={{ color: "#71717a", fontSize: 13, fontStyle: "italic", marginBottom: 24 }}>
        CRE Signal Engine is an underwriting support system. Final investment decisions require sponsor diligence and independent validation.
      </p>

      <div style={{ marginBottom: 32 }}>
        <MethodologyDownloadButton
          scanExportEnabled={scanExportEnabled}
          defaultFilename={defaultFilename}
        />
      </div>

      {/* Governance Guarantees */}
      <section style={{ marginBottom: 28, padding: 20, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fafafa", marginBottom: 12 }}>
          Governance Guarantees
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#e4e4e7", lineHeight: 1.8 }}>
          <li>Deterministic score construction</li>
          <li>Immutable risk audit log</li>
          <li>Snapshot hash reproducibility</li>
          <li>Version drift detection</li>
          <li>Tie-stable percentile method (midrank_v1)</li>
          <li>Driver share cap for explainability consistency</li>
        </ul>
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: "#a1a1aa" }}>
          This reinforces that you are infrastructure.
        </p>
      </section>

      <div style={{ fontSize: 14, color: "#e4e4e7", lineHeight: 1.6 }}>
        {sections.map((section: MethodologySection, i: number) => (
          <section key={i} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 8 }}>
              {section.heading}
            </h2>
            {"body" in section && section.body && (
              <p style={{ marginBottom: 8, whiteSpace: "pre-line" }}>{section.body}</p>
            )}
            {"bullets" in section && section.bullets?.length ? (
              <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
                {section.bullets.map((b, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#71717a", marginTop: 24, fontStyle: "italic" }}>
        {disclaimerLines[0]}
      </p>
    </main>
  );
}
