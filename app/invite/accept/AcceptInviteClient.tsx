"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

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
      const res = await fetchJsonWithTimeout("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }, 15000);
      const data = (res.json ?? {}) as { org_id?: string; error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const orgId = data.org_id;
      if (orgId) {
        await fetchJsonWithTimeout("/api/org/current", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_org_id: orgId }),
        }, 15000);
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
      <p className="text-muted-foreground text-sm mb-4">
        You&apos;re signed in as <strong className="text-foreground">{userEmail}</strong>. Click below to
        join the workspace.
      </p>
      {error && (
        <p className="text-[#ef4444] text-sm mb-3">{error}</p>
      )}
      <button
        type="button"
        onClick={handleAccept}
        disabled={loading}
        className="px-6 py-3 bg-[#3b82f6] text-white border-none rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
      >
        {loading ? "Joining\u2026" : "Accept invite"}
      </button>
    </div>
  );
}
