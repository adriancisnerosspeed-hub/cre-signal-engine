"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  token_preview: string;
};

export default function ApiTokensClient() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchJsonWithTimeout("/api/settings/api-tokens", {}, 15000).then((res) => {
      const data = res.json as { tokens?: TokenRow[] } | undefined;
      setTokens(data?.tokens ?? []);
      setLoading(false);
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setNewToken(null);
    const name = createName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetchJsonWithTimeout("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }, 15000);
      const data = res.json as { token?: string; name?: string; error?: string } | undefined;
      if (!res.ok) {
        setCreateError(data?.error ?? `Error ${res.status}`);
        return;
      }
      if (data?.token) {
        setNewToken(data.token);
        setCreateName("");
        setTokens((prev) => [
          ...prev,
          {
            id: (data as { id?: string }).id ?? "",
            name: data.name ?? name,
            last_used_at: null,
            created_at: (data as { created_at?: string }).created_at ?? new Date().toISOString(),
            token_preview: "••••••••",
          },
        ]);
      }
      router.refresh();
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this token? It will stop working immediately.")) return;
    setRevoking(id);
    try {
      const res = await fetchJsonWithTimeout(`/api/settings/api-tokens/${id}`, { method: "DELETE" }, 15000);
      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.id !== id));
        router.refresh();
      }
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="p-5 bg-muted/50 border border-border rounded-lg">
        <h2 className="text-base font-semibold text-foreground mb-3">Create token</h2>
        <form onSubmit={handleCreate} className="flex gap-3 items-end flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground/70">Name</span>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. CI / reporting"
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[200px]"
            />
          </label>
          <button
            type="submit"
            disabled={createLoading}
            className="px-4 py-2 bg-[#3b82f6] text-white border-none rounded-md font-medium"
            style={{ cursor: createLoading ? "not-allowed" : "pointer" }}
          >
            {createLoading ? "Creating…" : "Create"}
          </button>
        </form>
        {createError && <p className="text-[#f87171] text-sm mt-2">{createError}</p>}
        {newToken && (
          <div className="mt-3 p-3 bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.3)] rounded-md text-[13px]">
            <p className="text-[#22c55e] mb-1.5">Token created. Copy it now — it won&apos;t be shown again.</p>
            <code className="break-all text-foreground">{newToken}</code>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Tokens</h2>
        {loading ? (
          <p className="text-muted-foreground/70">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground/70">No tokens yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Name</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Created</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Last used</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground/70 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-b border-border">
                    <td className="px-3 py-2.5 text-foreground">{t.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevoke(t.id)}
                        disabled={revoking === t.id}
                        className="px-2.5 py-1 bg-transparent text-[#f87171] border border-[rgba(248,113,113,0.4)] rounded text-[13px]"
                        style={{ cursor: revoking === t.id ? "not-allowed" : "pointer" }}
                      >
                        {revoking === t.id ? "Revoking…" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
