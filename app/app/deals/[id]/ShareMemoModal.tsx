"use client";

import { useState, useEffect, useRef } from "react";

type ShareLink = {
  token: string;
  url: string;
  view_count: number;
  password_protected?: boolean;
};

function getFullUrl(urlPath: string): string {
  if (typeof window === "undefined") return urlPath;
  return `${window.location.origin}${urlPath}`;
}

export default function ShareMemoModal({ scanId }: { scanId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // On open, check for existing link
  useEffect(() => {
    if (!open || !scanId) return;
    if (checked) return;
    setError(null);
    setLoading(true);
    fetch(`/api/deals/scans/${scanId}/share`)
      .then((r) => r.json())
      .then((json) => {
        const j = json as { link?: ShareLink | null; error?: string };
        if (j.error) setError(j.error);
        else if (j.link) setLink(j.link as ShareLink);
        setChecked(true);
      })
      .catch(() => {
        setError("Failed to load share link");
        setChecked(true);
      })
      .finally(() => setLoading(false));
  }, [open, checked, scanId]);

  // Reset checked when modal closes so we refetch next open
  useEffect(() => {
    if (!open) {
      setChecked(false);
      setError(null);
    }
  }, [open]);

  async function handleCreate() {
    if (!scanId) return;
    setError(null);
    setLoading(true);
    try {
      const body =
        usePassword && sharePassword.trim().length > 0 ? { password: sharePassword.trim() } : {};
      const res = await fetch(`/api/deals/scans/${scanId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        token?: string;
        url?: string;
        view_count?: number;
        password_protected?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Failed to create share link");
        return;
      }
      if (json.token && json.url) {
        const newLink: ShareLink = {
          token: json.token,
          url: json.url,
          view_count: json.view_count ?? 0,
          password_protected: json.password_protected,
        };
        setLink(newLink);
        setError(null);
        // Auto-copy so user gets link formed and copied in one step
        const fullUrl = getFullUrl(newLink.url);
        const didCopy = await copyToClipboard(fullUrl);
        if (didCopy) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        setError("Invalid response from server");
      }
    } catch {
      setError("Failed to create share link");
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

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to fallback
    }
    try {
      const input = urlInputRef.current ?? document.createElement("input");
      input.value = text;
      if (input !== urlInputRef.current) {
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        input.style.opacity = "0";
        document.body.appendChild(input);
      }
      input.select();
      input.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      if (input !== urlInputRef.current) document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }

  async function handleCopy() {
    if (!link) return;
    const fullUrl = getFullUrl(link.url);
    const ok = await copyToClipboard(fullUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setError("Could not copy to clipboard. Select and copy the link manually.");
    }
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

            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            {loading ? (
              <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>
            ) : link ? (
              <>
                <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
                  Anyone with this link can view the IC memo narrative and risk score. Financial inputs are not shown.
                  {link.password_protected && (
                    <span style={{ display: "block", marginTop: 8, color: "#eab308", fontWeight: 600 }}>
                      Password protected — recipients must enter the password you set.
                    </span>
                  )}
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    ref={urlInputRef}
                    readOnly
                    value={getFullUrl(link.url)}
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
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={(e) => {
                      setUsePassword(e.target.checked);
                      if (!e.target.checked) setSharePassword("");
                    }}
                  />
                  <span style={{ color: "#e4e4e7", fontSize: 13 }}>Require password to open</span>
                </label>
                {usePassword && (
                  <input
                    type="password"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="new-password"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: 16,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 6,
                      color: "#e4e4e7",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || (usePassword && sharePassword.trim().length === 0)}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: loading || (usePassword && sharePassword.trim().length === 0) ? "not-allowed" : "pointer",
                    opacity: loading || (usePassword && sharePassword.trim().length === 0) ? 0.6 : 1,
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
