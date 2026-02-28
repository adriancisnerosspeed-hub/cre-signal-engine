"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaywallModal from "@/app/components/PaywallModal";

/**
 * Small "Download PDF" link for methodology export. Used in Portfolio header and Settings.
 * On 403 PRO_REQUIRED_FOR_EXPORT, opens PaywallModal.
 */
export default function MethodologyDownloadLink({
  defaultFilename,
}: {
  defaultFilename: string;
}) {
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/methodology/export-pdf", { method: "GET" });
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
        return;
      }
      const contentType = res.headers.get("Content-Type") ?? "";
      if (!contentType.includes("application/pdf")) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(
        /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i
      );
      a.download = filenameMatch?.[1]?.trim() ?? defaultFilename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "#3b82f6",
          cursor: loading ? "wait" : "pointer",
          textDecoration: "none",
          fontSize: 13,
        }}
      >
        {loading ? "Generating…" : "Download PDF"}
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
