"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { user_id: string; role: string; email: string | null };
type Invite = { id: string; email: string; role: string; expires_at: string };

export default function WorkspaceClient({
  members,
  invites,
  currentUserId,
  canManage,
  canInvite,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  canManage: boolean;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError((data as { error?: string }).error || `Error ${res.status}`);
        return;
      }
      setInviteEmail("");
      setInviteSuccess(`Invite sent to ${email}`);
      router.refresh();
      setTimeout(() => setInviteSuccess(null), 5000);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/org/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) router.refresh();
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    try {
      const res = await fetch(`/api/org/members/${userId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } catch {}
  }

  const ownerCount = members.filter((m) => m.role === "owner").length;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        Members ({members.length})
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px" }}>
        {members.map((m) => (
          <li
            key={m.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              padding: "12px 16px",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              marginBottom: 8,
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            <div>
              <span style={{ color: "#fafafa", fontWeight: 500 }}>
                {m.email ?? "—"}
                {m.user_id === currentUserId && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#71717a" }}>(you)</span>
                )}
              </span>
              <span style={{ marginLeft: 8, fontSize: 12, color: "#a1a1aa" }}>{m.role}</span>
            </div>
            {canManage && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  disabled={
                    updating === m.user_id ||
                    m.user_id === currentUserId ||
                    (m.role === "owner" && ownerCount <= 1)
                  }
                  style={{
                    padding: "6px 10px",
                    backgroundColor: "#27272a",
                    color: "#e4e4e7",
                    border: "1px solid #52525b",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemove(m.user_id)}
                  disabled={
                    (m.user_id === currentUserId && members.length <= 1) ||
                    (m.role === "owner" && ownerCount <= 1)
                  }
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "transparent",
                    color: "#f87171",
                    border: "1px solid #f87171",
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Pending invites
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px" }}>
            {invites.map((inv) => (
              <li
                key={inv.id}
                style={{
                  padding: "12px 16px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  marginBottom: 8,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  fontSize: 14,
                  color: "#a1a1aa",
                }}
              >
                {inv.email} — {inv.role} (expires {new Date(inv.expires_at).toLocaleDateString()})
              </li>
            ))}
          </ul>
        </>
      )}

      {canManage && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Invite by email
            {!canInvite && (
              <span style={{ marginLeft: 8, fontSize: 14, color: "#71717a", fontWeight: 400 }}>
                Pro access required.
              </span>
            )}
          </h2>
          <form onSubmit={handleInvite} style={{ marginBottom: 24 }}>
            {!canInvite && (
              <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 12 }}>
                Pro access required.
              </p>
            )}
            {inviteError && (
              <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 8 }}>{inviteError}</p>
            )}
            {inviteSuccess && (
              <p style={{ color: "#22c55e", fontSize: 14, marginBottom: 8 }}>{inviteSuccess}</p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                required={canInvite}
                disabled={!canInvite}
                style={{
                  padding: "10px 14px",
                  backgroundColor: "#27272a",
                  color: "#fafafa",
                  border: "1px solid #52525b",
                  borderRadius: 6,
                  fontSize: 14,
                  minWidth: 200,
                  opacity: canInvite ? 1 : 0.7,
                }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                disabled={!canInvite}
                style={{
                  padding: "10px 14px",
                  backgroundColor: "#27272a",
                  color: "#e4e4e7",
                  border: "1px solid #52525b",
                  borderRadius: 6,
                  fontSize: 14,
                  opacity: canInvite ? 1 : 0.7,
                }}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="submit"
                disabled={inviteLoading || !canInvite}
                style={{
                  padding: "10px 20px",
                  backgroundColor: canInvite ? "var(--foreground)" : "#27272a",
                  color: canInvite ? "var(--background)" : "#71717a",
                  border: "1px solid #52525b",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: canInvite && !inviteLoading ? "pointer" : "not-allowed",
                  opacity: canInvite ? 1 : 0.8,
                }}
              >
                {inviteLoading ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
