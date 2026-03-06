"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";
import { formatNarrativeAsText } from "@/lib/export/scanNarrative";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { renderMarkdown } from "@/lib/ui/renderMarkdown";
import ShareMemoModal from "./ShareMemoModal";

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

  async function handleDownload() {
    if (!narrativeContent || !scanExportEnabled || !scanId) return;
    const res = await fetch(`/api/deals/scans/${scanId}/narrative/export-pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = dealName ? dealName.replace(/[^a-z0-9]/gi, "-").slice(0, 30).toLowerCase() : "deal";
    a.download = `ic-memo-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          IC Memorandum Narrative
        </h2>
        {narrativeContent ? (
          <div className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03] text-sm text-gray-800 dark:text-zinc-200">
            {renderMarkdown(narrativeContent)}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            Generate a one-page institutional memo summarizing key assumptions, primary risks, and
            recommendation framework.
          </p>
        )}
        {scanId && (
          <button
            type="button"
            onClick={handleGenerateClick}
            disabled={generating}
            className="mt-2 py-2.5 px-5 bg-gray-900 dark:bg-white text-white dark:text-black border-0 rounded-md font-semibold text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generating ? "Generating…" : narrativeContent ? "Regenerate IC Memorandum Narrative" : "Generate IC Memorandum Narrative"}
          </button>
        )}
        {narrativeContent && scanExportEnabled && (
          <div className="flex gap-3 mt-3 flex-wrap">
            <button
              type="button"
              onClick={handleCopy}
              className="py-2 px-4 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-white/20 rounded-md text-sm cursor-pointer"
            >
              {copyDone ? "Copied" : "Copy to clipboard"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="py-2 px-4 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-zinc-200 border border-gray-300 dark:border-white/20 rounded-md text-sm cursor-pointer"
            >
              Download as PDF
            </button>
            {scanId && <ShareMemoModal scanId={scanId} />}
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
