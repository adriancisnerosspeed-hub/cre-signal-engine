"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

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
      const res = await fetchJsonWithTimeout(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ic_status: status,
          ic_decision_date: date.trim() || null,
          ic_notes: notes.trim() || null,
        }),
      }, 15000);
      if (!res.ok) {
        const data = (res.json ?? {}) as { error?: string };
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
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
        IC Status
      </h2>
      <div className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IcStatus)}
              className="w-full max-w-[280px] py-2 px-3 rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-black/20 text-gray-900 dark:text-white text-sm"
            >
              {(Object.keys(IC_STATUS_LABELS) as IcStatus[]).map((v) => (
                <option key={v} value={v}>
                  {IC_STATUS_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              Decision date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="py-2 px-3 rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-black/20 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conditions, rationale, etc."
              rows={3}
              className="w-full py-2 px-3 rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-black/20 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm resize-y"
            />
          </div>
          {error && (
            <p className="text-[13px] text-red-400 m-0">{error}</p>
          )}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="self-start py-2 px-4 rounded-md border-0 bg-[#3b82f6] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400 dark:text-zinc-500">
        Changing IC status does not affect the risk score.
      </p>
    </section>
  );
}
