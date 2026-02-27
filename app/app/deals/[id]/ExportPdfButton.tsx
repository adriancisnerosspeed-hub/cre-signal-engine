"use client";

import { useState } from "react";
import PaywallModal from "@/app/components/PaywallModal";

export default function ExportPdfButton({
  scanId,
  scanExportEnabled,
}: {
  scanId: string;
  scanExportEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (!scanExportEnabled) {
      setPaywallOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: scanId }),
      });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "PRO_REQUIRED_FOR_EXPORT") setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const d = data as { error?: string; detail?: string };
        const msg =
          typeof d.detail === "string" && d.detail
            ? d.detail
            : typeof d.error === "string"
              ? d.error
              : `Export failed (${res.status})`;
        setError(msg);
        return;
      }
      const contentType = res.headers.get("Content-Type") ?? "";
      if (!contentType.includes("application/pdf")) {
        setError("Server did not return a PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
      a.download = filenameMatch?.[1]?.trim() ?? `cre-signal-export-${scanId.slice(0, 8)}.pdf`;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "transparent",
            color: "#a1a1aa",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Exporting…" : "Export PDF"}
        </button>
        {error && (
          <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>
        )}
      </div>
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title="Export locked"
        subtitle="Pro access required for PDF export."
      />
    </>
  );
}
