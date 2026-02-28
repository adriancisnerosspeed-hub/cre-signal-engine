"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type IcStatus = "PRE_IC" | "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED";

const IC_STATUS_LABELS: Record<IcStatus, string> = {
  PRE_IC: "Pre-IC",
  APPROVED: "Approved",
  APPROVED_WITH_CONDITIONS: "Approved with conditions",
  REJECTED: "Rejected",
};

export default function IcStatusBlock({
  dealId,
  icStatus,
  icDecisionDate,
  icNotes,
}: {
  dealId: string;
  icStatus: IcStatus | null;
  icDecisionDate: string | null;
  icNotes: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<IcStatus>(icStatus ?? "PRE_IC");
  const [date, setDate] = useState(icDecisionDate ?? "");
  const [notes, setNotes] = useState(icNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ic_status: status,
          ic_decision_date: date.trim() || null,
          ic_notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    status !== (icStatus ?? "PRE_IC") ||
    date !== (icDecisionDate ?? "") ||
    notes !== (icNotes ?? "");

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        IC Status
      </h2>
      <div
        style={{
          padding: "16px 20px",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IcStatus)}
              style={{
                width: "100%",
                maxWidth: 280,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fafafa",
                fontSize: 14,
              }}
            >
              {(Object.keys(IC_STATUS_LABELS) as IcStatus[]).map((v) => (
                <option key={v} value={v}>
                  {IC_STATUS_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>
              Decision date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fafafa",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6 }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conditions, rationale, etc."
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fafafa",
                fontSize: 14,
                resize: "vertical",
              }}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: "#f87171", margin: 0 }}>{error}</p>
          )}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                alignSelf: "flex-start",
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#3b82f6",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: "#71717a" }}>
        Changing IC status does not affect the risk score.
      </p>
    </section>
  );
}
