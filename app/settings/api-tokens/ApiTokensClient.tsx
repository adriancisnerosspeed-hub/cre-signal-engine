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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section style={{ padding: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 12 }}>Create token</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#71717a" }}>Name</span>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. CI / reporting"
              style={{ padding: "8px 12px", minWidth: 200, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
            />
          </label>
          <button
            type="submit"
            disabled={createLoading}
            style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: createLoading ? "not-allowed" : "pointer", fontWeight: 500 }}
          >
            {createLoading ? "Creating…" : "Create"}
          </button>
        </form>
        {createError && <p style={{ color: "#f87171", fontSize: 14, marginTop: 8 }}>{createError}</p>}
        {newToken && (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, fontSize: 13 }}>
            <p style={{ color: "#22c55e", marginBottom: 6 }}>Token created. Copy it now — it won&apos;t be shown again.</p>
            <code style={{ wordBreak: "break-all", color: "#e4e4e7" }}>{newToken}</code>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 12 }}>Tokens</h2>
        {loading ? (
          <p style={{ color: "#71717a" }}>Loading…</p>
        ) : tokens.length === 0 ? (
          <p style={{ color: "#71717a" }}>No tokens yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Created</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Last used</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "10px 12px", color: "#e4e4e7" }}>{t.name}</td>
                    <td style={{ padding: "10px 12px", color: "#a1a1aa" }}>{new Date(t.created_at).toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "#a1a1aa" }}>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleRevoke(t.id)}
                        disabled={revoking === t.id}
                        style={{ padding: "4px 10px", background: "transparent", color: "#f87171", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, cursor: revoking === t.id ? "not-allowed" : "pointer", fontSize: 13 }}
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
