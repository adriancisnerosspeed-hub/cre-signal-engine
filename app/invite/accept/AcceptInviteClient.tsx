"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInviteClient({
  token,
  userEmail,
}: {
  token: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || `Error ${res.status}`);
        return;
      }
      const orgId = (data as { org_id?: string }).org_id;
      if (orgId) {
        await fetch("/api/org/current", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_org_id: orgId }),
        });
      }
      router.push("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 16 }}>
        You’re signed in as <strong style={{ color: "#e4e4e7" }}>{userEmail}</strong>. Click below to
        join the workspace.
      </p>
      {error && (
        <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 12 }}>{error}</p>
      )}
      <button
        type="button"
        onClick={handleAccept}
        disabled={loading}
        style={{
          padding: "12px 24px",
          backgroundColor: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
