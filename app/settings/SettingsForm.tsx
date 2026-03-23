"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

const SIGNAL_TYPES = [
  "Pricing",
  "Credit Availability",
  "Credit Risk",
  "Liquidity",
  "Supply-Demand",
  "Policy",
  "Deal-Specific",
];

const ACTIONS = ["Act", "Monitor"];

const CONFIDENCE_OPTIONS = ["Low", "Medium", "High"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

type PrefsState = {
  signal_types: string[];
  actions: string[];
  min_confidence: string;
  timezone: string;
  digest_time_local: string;
  digest_enabled: boolean;
};

export default function SettingsForm({
  initialPreferences,
}: {
  initialPreferences: PrefsState;
}) {
  const [prefs, setPrefs] = useState<PrefsState>(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const toggleSignalType = useCallback((type: string) => {
    setPrefs((p) => ({
      ...p,
      signal_types: p.signal_types.includes(type)
        ? p.signal_types.filter((t) => t !== type)
        : [...p.signal_types, type],
    }));
  }, []);

  const toggleAction = useCallback((action: string) => {
    setPrefs((p) => ({
      ...p,
      actions: p.actions.includes(action)
        ? p.actions.filter((a) => a !== action)
        : [...p.actions, action],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetchJsonWithTimeout("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      }, 15000);
      const data = res.json;
      if (!res.ok) throw new Error((data?.error as string) || "Save failed");
      setSaveMessage("Preferences saved.");
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const handleSendTest = useCallback(async () => {
    setSending(true);
    setSendMessage(null);
    try {
      const res = await fetchJsonWithTimeout("/api/digest/send-now", { method: "POST" }, 15000);
      const data = res.json;
      if (!res.ok) throw new Error((data?.error as string) || (data?.message as string) || "Send failed");
      setSendMessage((data?.message as string) || "Risk Brief sent.");
    } catch (e) {
      setSendMessage(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="max-w-[560px]"
    >
      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <span className="block mb-2 text-foreground text-[13px] font-medium">Signal types</span>
        <div className="flex flex-wrap gap-2">
          {SIGNAL_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-foreground text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.signal_types.includes(t)}
                onChange={() => toggleSignalType(t)}
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <span className="block mb-2 text-foreground text-[13px] font-medium">Actions</span>
        <div className="flex gap-4">
          {ACTIONS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-foreground text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.actions.includes(a)}
                onChange={() => toggleAction(a)}
              />
              {a}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <label className="block mb-2 text-foreground text-[13px] font-medium">Minimum confidence</label>
        <select
          value={prefs.min_confidence}
          onChange={(e) => setPrefs((p) => ({ ...p, min_confidence: e.target.value }))}
          className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[140px]"
        >
          {CONFIDENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <label className="block mb-2 text-foreground text-[13px] font-medium">Timezone</label>
        <select
          value={TIMEZONES.includes(prefs.timezone) ? prefs.timezone : ""}
          onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value || p.timezone }))}
          className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[220px]"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
          <option value="">Other (type below)</option>
        </select>
        {!TIMEZONES.includes(prefs.timezone) && (
          <input
            type="text"
            placeholder="e.g. America/Chicago"
            value={prefs.timezone}
            onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value.trim() || "America/Chicago" }))}
            className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm mt-2 w-full max-w-[280px]"
          />
        )}
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <label className="block mb-2 text-foreground text-[13px] font-medium">Daily Risk Brief time (local)</label>
        <input
          type="time"
          value={prefs.digest_time_local}
          onChange={(e) => setPrefs((p) => ({ ...p, digest_time_local: e.target.value }))}
          className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
        />
        <span className="ml-2 text-muted-foreground/70 text-xs">24h format</span>
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <label className="flex items-center gap-2 text-foreground text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.digest_enabled}
            onChange={(e) => setPrefs((p) => ({ ...p, digest_enabled: e.target.checked }))}
          />
          Risk Brief enabled (receive scheduled daily Risk Brief)
        </label>
      </div>

      <div className="flex items-center gap-4 flex-wrap mb-6">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-[#3b82f6] text-white border-none rounded-md font-semibold"
          style={{ cursor: saving ? "not-allowed" : "pointer" }}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {saveMessage && (
          <span className={`text-sm ${saveMessage.startsWith("Preferences") ? "text-green-300" : "text-red-300"}`}>
            {saveMessage}
          </span>
        )}
      </div>

      <div className="mb-5 p-4 bg-card border border-border rounded-[10px]">
        <span className="block mb-2 text-foreground text-[13px] font-medium">Test Risk Brief</span>
        <p className="text-muted-foreground text-[13px] mb-3">
          Send the Risk Brief for the last 24 hours to your email now (ignores schedule).
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={sending}
            className="px-4 py-2 bg-muted text-foreground border border-border rounded-md"
            style={{ cursor: sending ? "not-allowed" : "pointer" }}
          >
            {sending ? "Sending…" : "Send test Risk Brief now"}
          </button>
          <Link
            href="/digest/preview"
            className="text-[#3b82f6] text-sm"
          >
            Preview Risk Brief
          </Link>
          {sendMessage && (
            <span className={`text-sm ${sendMessage.startsWith("Risk Brief") || sendMessage.includes("24 hours") ? "text-green-300" : "text-red-300"}`}>
              {sendMessage}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
