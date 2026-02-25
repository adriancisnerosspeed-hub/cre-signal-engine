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

  async function handleExport() {
    if (!scanExportEnabled) {
      setPaywallOpen(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/deals/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: scanId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === "PRO_REQUIRED_FOR_EXPORT") {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cre-signal-export-${scanId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
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
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title="Export locked"
        subtitle="Pro access required for PDF export."
      />
    </>
  );
}
