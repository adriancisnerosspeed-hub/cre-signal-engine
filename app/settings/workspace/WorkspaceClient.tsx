"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type Member = { user_id: string; role: string; email: string | null };
type Invite = { id: string; email: string; role: string; expires_at: string };

export default function WorkspaceClient({
  members,
  invites,
  currentUserId,
  canManage,
  canInvite,
  memberLimitLabel,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  canManage: boolean;
  canInvite: boolean;
  memberLimitLabel?: string;
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
      const res = await fetchJsonWithTimeout("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      }, 15000);
      const data = res.json ?? {};
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
      const res = await fetchJsonWithTimeout(`/api/org/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }, 15000);
      if (res.ok) router.refresh();
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    try {
      const res = await fetchJsonWithTimeout(`/api/org/members/${userId}`, { method: "DELETE" }, 15000);
      if (res.ok) router.refresh();
    } catch {}
  }

  const ownerCount = members.filter((m) => m.role === "OWNER").length;

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">
        Workspace members ({members.length})
        {memberLimitLabel && (
          <span className="font-normal text-muted-foreground/70 text-sm ml-2">
            · {memberLimitLabel}
          </span>
        )}
      </h2>
      <ul className="list-none p-0 mb-6">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border border-border rounded-lg mb-2 bg-muted/50"
          >
            <div>
              <span className="text-foreground font-medium">
                {m.email ?? "—"}
                {m.user_id === currentUserId && (
                  <span className="ml-2 text-xs text-muted-foreground/70">(you)</span>
                )}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  disabled={
                    updating === m.user_id ||
                    m.user_id === currentUserId ||
                    (m.role === "OWNER" && ownerCount <= 1)
                  }
                  className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-[13px]"
                >
                  <option value="OWNER">OWNER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemove(m.user_id)}
                  disabled={
                    (m.user_id === currentUserId && members.length <= 1) ||
                    (m.role === "OWNER" && ownerCount <= 1)
                  }
                  className="px-3 py-1.5 bg-transparent text-[#f87171] border border-[#f87171] rounded-md text-[13px] cursor-pointer"
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
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Pending invites
          </h2>
          <ul className="list-none p-0 mb-6">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="px-4 py-3 border border-border rounded-lg mb-2 bg-muted/50 text-sm text-muted-foreground"
              >
                {inv.email} — {inv.role} (expires {new Date(inv.expires_at).toLocaleDateString()})
              </li>
            ))}
          </ul>
        </>
      )}

      {canManage && (
        <>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Invite by email
            {!canInvite && (
              <span className="ml-2 text-sm text-muted-foreground/70 font-normal">
                Workspace invites require a paid plan.
              </span>
            )}
          </h2>
          <form onSubmit={handleInvite} className="mb-6">
            {!canInvite && (
              <p className="text-muted-foreground text-sm mb-3">
                Workspace invites require a paid plan.
              </p>
            )}
            {inviteError && (
              <p className="text-[#ef4444] text-sm mb-2">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="text-[#22c55e] text-sm mb-2">{inviteSuccess}</p>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                required={canInvite}
                disabled={!canInvite}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[200px]"
                style={{ opacity: canInvite ? 1 : 0.7 }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                disabled={!canInvite}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                style={{ opacity: canInvite ? 1 : 0.7 }}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="submit"
                disabled={inviteLoading || !canInvite}
                className={`px-5 py-2.5 rounded-md border border-border font-semibold text-sm ${
                  canInvite
                    ? "bg-foreground text-background cursor-pointer"
                    : "bg-muted text-muted-foreground/70 cursor-not-allowed"
                }`}
                style={{ opacity: canInvite ? 1 : 0.8 }}
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
