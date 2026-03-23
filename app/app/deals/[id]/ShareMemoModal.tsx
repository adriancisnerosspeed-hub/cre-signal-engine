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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-muted/50 text-foreground border border-border rounded-md text-sm cursor-pointer"
      >
        Share
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-[480px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-foreground m-0">
                Share IC Memo
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-transparent border-none text-muted-foreground/70 text-xl cursor-pointer leading-none"
              >
                ×
              </button>
            </div>

            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : link ? (
              <>
                <p className="text-muted-foreground text-[13px] mb-3">
                  Anyone with this link can view the IC memo narrative and risk score. Financial inputs are not shown.
                  {link.password_protected && (
                    <span className="block mt-2 font-semibold" style={{ color: "#eab308" }}>
                      Password protected — recipients must enter the password you set.
                    </span>
                  )}
                </p>
                <div className="flex gap-2 mb-3">
                  <input
                    ref={urlInputRef}
                    readOnly
                    value={getFullUrl(link.url)}
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-muted/50 text-foreground text-[13px] font-mono"
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
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground/70">
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
                <p className="text-muted-foreground text-[13px] mb-4">
                  Create a public link that lets anyone view the IC memo narrative and risk score. Financial inputs and assumptions are not shared.
                </p>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={(e) => {
                      setUsePassword(e.target.checked);
                      if (!e.target.checked) setSharePassword("");
                    }}
                  />
                  <span className="text-foreground text-[13px]">Require password to open</span>
                </label>
                {usePassword && (
                  <input
                    type="password"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 mb-4 rounded-md border border-border bg-background text-foreground text-sm box-border"
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
