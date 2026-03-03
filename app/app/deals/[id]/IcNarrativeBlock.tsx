"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";
import { formatNarrativeAsText } from "@/lib/export/scanNarrative";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h4 key={i} style={{ fontSize: 13, fontWeight: 700, color: "#f4f4f5", marginTop: 14, marginBottom: 2 }}>
          {renderInline(line.slice(4))}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: "#f4f4f5", marginTop: 18, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 4 }}>
          {renderInline(line.slice(3))}
        </h3>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2 key={i} style={{ fontSize: 15, fontWeight: 700, color: "#f4f4f5", marginTop: 20, marginBottom: 6 }}>
          {renderInline(line.slice(2))}
        </h2>
      );
    }
    if (line.trim() === "") {
      return <div key={i} style={{ height: 8 }} />;
    }
    return (
      <p key={i} style={{ margin: "3px 0", lineHeight: 1.65 }}>
        {renderInline(line)}
      </p>
    );
  });
}

const REDACTED_PREVIEW =
  "Based on the underwriting inputs and current macro signals, the primary investment risks are associated with exit cap compression and supply-driven rent growth assumptions. The capital structure introduces moderate refinancing exposure…";

export default function IcNarrativeBlock({
  icNarrativeEnabled,
  scanExportEnabled,
  scanId,
  narrativeContent,
  dealName,
  scanCreatedAt,
  riskIndexScore,
  riskIndexBand,
}: {
  icNarrativeEnabled: boolean;
  scanExportEnabled: boolean;
  scanId: string | null;
  narrativeContent: string | null;
  dealName?: string | null;
  scanCreatedAt?: string | null;
  riskIndexScore?: number | null;
  riskIndexBand?: string | null;
}) {
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  async function handleGenerateClick() {
    if (!icNarrativeEnabled) {
      setPaywallOpen(true);
      return;
    }
    if (!scanId) return;
    setGenerating(true);
    try {
      const res = await fetchJsonWithTimeout(`/api/deals/scans/${scanId}/narrative`, { method: "POST" }, 15000);
      if (res.ok) router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  function getExportText(): string {
    return formatNarrativeAsText({
      narrative: narrativeContent ?? "",
      dealName,
      scanCreatedAt,
      riskIndexScore,
      riskIndexBand,
    });
  }

  async function handleCopy() {
    if (!narrativeContent || !scanExportEnabled) return;
    await navigator.clipboard.writeText(getExportText());
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }

  function handleDownload() {
    if (!narrativeContent || !scanExportEnabled) return;
    const blob = new Blob([getExportText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ic-memo-${dealName ? dealName.replace(/\s+/g, "-").slice(0, 30) : "deal"}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          IC Memorandum Narrative
        </h2>
        {narrativeContent ? (
          <div
            style={{
              padding: "16px 20px",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.03)",
              fontSize: 14,
              color: "#e4e4e7",
            }}
          >
            {renderMarkdown(narrativeContent)}
          </div>
        ) : (
          <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 12 }}>
            Generate a one-page institutional memo summarizing key assumptions, primary risks, and
            recommendation framework.
          </p>
        )}
        {scanId && (
          <button
            type="button"
            onClick={handleGenerateClick}
            disabled={generating}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? "Generating…" : narrativeContent ? "Regenerate IC Memorandum Narrative" : "Generate IC Memorandum Narrative"}
          </button>
        )}
        {narrativeContent && scanExportEnabled && (
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: "8px 16px",
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#e4e4e7",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {copyDone ? "Copied" : "Copy to clipboard"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: "8px 16px",
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#e4e4e7",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Download as .txt
            </button>
          </div>
        )}
      </section>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title="IC Memorandum Narrative is a Pro feature"
        subtitle="Upgrade to generate institutional memo narratives for your deal scans."
        redactedPreview={REDACTED_PREVIEW}
      />
    </>
  );
}
