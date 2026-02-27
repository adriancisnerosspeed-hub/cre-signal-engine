"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizeMarket } from "@/lib/normalizeMarket";

export default function NewDealPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [market, setMarket] = useState("");
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled deal",
          asset_type: assetType.trim() || null,
          market: market.trim() || null,
          raw_text: rawText.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      router.push(`/app/deals/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app/deals" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Back to deals
        </Link>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 24 }}>
        New deal
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label htmlFor="name" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "#e4e4e7" }}>
            Deal name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 123 Main St"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <label htmlFor="asset_type" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "#e4e4e7" }}>
            Asset type
          </label>
          <input
            id="asset_type"
            type="text"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            placeholder="e.g. Multifamily, Office"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <label htmlFor="market" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "#e4e4e7" }}>
            Market
          </label>
          <input
            id="market"
            type="text"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            onBlur={() => {
              const v = market.trim();
              if (v) {
                const r = normalizeMarket({ market: v });
                if (r.market_label) setMarket(r.market_label);
              }
            }}
            placeholder="e.g. Austin, TX or Dallas, Texas"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <label htmlFor="raw_text" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "#e4e4e7" }}>
            Underwriting excerpt (paste text)
          </label>
          <textarea
            id="raw_text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste underwriting assumptions, memo excerpt, or notes..."
            rows={8}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </div>
        {error && (
          <p style={{ color: "#ef4444", fontSize: 14 }}>{error}</p>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 24px",
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Creating…" : "Create deal"}
          </button>
          <Link
            href="/app/deals"
            style={{
              padding: "10px 24px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              color: "var(--foreground)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
