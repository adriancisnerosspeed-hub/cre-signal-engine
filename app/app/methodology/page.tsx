import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getPlanForUser, getEntitlementsForUser } from "@/lib/entitlements";
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

  const service = createServiceRoleClient();
  const plan = await getPlanForUser(service, user.id);
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
        {title}
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 4 }}>
        Current Scoring Version: v{version}
      </p>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 24 }}>
        Published: {publishedAt}
      </p>

      {!scanExportEnabled && (
        <div
          style={{
            padding: 12,
            marginBottom: 24,
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 14,
            color: "#e4e4e7",
          }}
        >
          Pro required for PDF export.
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <MethodologyDownloadButton
          scanExportEnabled={scanExportEnabled}
          defaultFilename={defaultFilename}
        />
      </div>

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
