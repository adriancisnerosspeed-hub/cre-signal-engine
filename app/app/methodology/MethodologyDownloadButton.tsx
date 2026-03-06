"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";
import { fetchWithTimeout } from "@/lib/fetchJsonWithTimeout";

export default function MethodologyDownloadButton({
  scanExportEnabled,
  defaultFilename,
}: {
  scanExportEnabled: boolean;
  defaultFilename: string;
}) {
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDownload() {
    if (!scanExportEnabled) {
      setPaywallOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/methodology/export-pdf", { method: "GET" }, 15000);
      if (!res.ok) {
        const raw = await res.text();
        let data: { code?: string } = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        if (res.status === 401 && data.code === "UNAUTHENTICATED") {
          router.push("/login");
          return;
        }
        if (res.status === 403 && data.code === "PRO_REQUIRED_FOR_EXPORT") {
          setPaywallOpen(true);
          return;
        }
        setError(res.status === 401 ? "Sign in required." : `Export failed (${res.status}).`);
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
      a.download = filenameMatch?.[1]?.trim() ?? defaultFilename;
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "transparent",
            color: "#a1a1aa",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Generating…" : scanExportEnabled ? "Download PDF" : "Download PDF (Pro required)"}
        </button>
        {error && (
          <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>
        )}
      </div>
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title="Export locked"
        subtitle="Starter plan required for PDF export."
      />
    </>
  );
}
