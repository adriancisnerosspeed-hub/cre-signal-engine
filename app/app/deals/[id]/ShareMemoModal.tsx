"use client";

import { useState, useEffect } from "react";

type ShareLink = {
  token: string;
  url: string;
  view_count: number;
};

export default function ShareMemoModal({ scanId }: { scanId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState(false);

  // On open, check for existing link
  useEffect(() => {
    if (!open || checked) return;
    setLoading(true);
    fetch(`/api/deals/scans/${scanId}/share`)
      .then((r) => r.json())
      .then((json) => {
        const j = json as { link?: ShareLink | null };
        if (j.link) setLink(j.link);
        setChecked(true);
      })
      .catch(() => setChecked(true))
      .finally(() => setLoading(false));
  }, [open, checked, scanId]);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/scans/${scanId}/share`, { method: "POST" });
      const json = await res.json() as { token?: string; url?: string; view_count?: number };
      if (json.token && json.url) {
        setLink({ token: json.token, url: json.url, view_count: json.view_count ?? 0 });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await fetch(`/api/deals/scans/${scanId}/share`, { method: "DELETE" });
      setLink(null);
    } finally {
      setRevoking(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    const fullUrl = `${window.location.origin}${link.url}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const buttonStyle: React.CSSProperties = {
    padding: "8px 16px",
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#e4e4e7",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle}>
        Share
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              backgroundColor: "#18181b",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 480,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7", margin: 0 }}>
                Share IC Memo
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#71717a", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>
            ) : link ? (
              <>
                <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
                  Anyone with this link can view the IC memo narrative and risk score. Financial inputs are not shown.
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}${link.url}`}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 6,
                      color: "#e4e4e7",
                      fontSize: 13,
                      fontFamily: "monospace",
                    }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    style={{
                      padding: "8px 14px",
                      backgroundColor: "#3b82f6",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#52525b" }}>
                    {link.view_count} {link.view_count === 1 ? "view" : "views"}
                  </span>
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={revoking}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      fontSize: 13,
                      cursor: revoking ? "not-allowed" : "pointer",
                      opacity: revoking ? 0.6 : 1,
                    }}
                  >
                    {revoking ? "Revoking…" : "Revoke link"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 16 }}>
                  Create a public link that lets anyone view the IC memo narrative and risk score. Financial inputs and assumptions are not shared.
                </p>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Create share link
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
