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
    <main className="max-w-[720px] mx-auto p-6">
      <div className="mb-6">
        <Link href="/app" className="text-muted-foreground text-sm no-underline hover:text-foreground transition-colors">
          ← Dashboard
        </Link>
      </div>

      <h1 className="text-[28px] font-bold text-foreground mb-2">
        CRE Signal Risk Index™
      </h1>
      <p className="text-muted-foreground text-base font-semibold mb-2">
        Version {version} — Institutional Stable
      </p>
      <p className="text-muted-foreground text-sm mb-4">
        This methodology is versioned and locked for determinism.
      </p>
      <ul className="text-muted-foreground text-sm mb-4 pl-5 leading-[1.7]">
        <li>Scores do not change retroactively.</li>
        <li>Percentiles reference frozen cohort snapshots.</li>
        <li>Delta comparability is enforced across versions.</li>
        <li>Stability guarantees are test-covered.</li>
      </ul>
      <p className="text-muted-foreground text-sm mb-2">
        Published: {publishedAt}
      </p>
      <p className="text-muted-foreground/70 text-[13px] italic mb-6">
        CRE Signal Engine is an underwriting support system. Final investment decisions require sponsor diligence and independent validation.
      </p>

      <div className="mb-8">
        <MethodologyDownloadButton
          scanExportEnabled={scanExportEnabled}
          defaultFilename={defaultFilename}
        />
      </div>

      {/* Governance Guarantees */}
      <section className="mb-7 p-5 bg-muted/50 border border-border rounded-[10px]">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Governance Guarantees
        </h2>
        <ul className="m-0 pl-5 text-sm text-foreground leading-[1.8]">
          <li>Deterministic score construction</li>
          <li>Immutable risk audit log</li>
          <li>Snapshot hash reproducibility</li>
          <li>Version drift detection</li>
          <li>Tie-stable percentile method (midrank_v1)</li>
          <li>Driver share cap for explainability consistency</li>
        </ul>
        <p className="mt-3 mb-0 text-[13px] text-muted-foreground">
          This reinforces that you are infrastructure.
        </p>
      </section>

      <div className="text-sm text-foreground leading-[1.6]">
        {sections.map((section: MethodologySection, i: number) => (
          <section key={i} className="mb-6">
            <h2 className="text-base font-semibold text-foreground mb-2">
              {section.heading}
            </h2>
            {"body" in section && section.body && (
              <p className="mb-2 whitespace-pre-line">{section.body}</p>
            )}
            {"bullets" in section && section.bullets?.length ? (
              <ul className="m-0 mb-2 pl-5">
                {section.bullets.map((b, j) => (
                  <li key={j} className="mb-1">
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/70 mt-6 italic">
        {disclaimerLines[0]}
      </p>
    </main>
  );
}
