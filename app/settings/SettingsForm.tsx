"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

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
      const res = await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
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
      const res = await fetch("/api/digest/send-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSendMessage(data.message || "Digest sent.");
    } catch (e) {
      setSendMessage(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, []);

  const blockStyle = {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 10,
  };
  const labelStyle = { display: "block", marginBottom: 8, color: "#e4e4e7", fontSize: 13, fontWeight: 500 };
  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #3f3f46",
    backgroundColor: "#27272a",
    color: "#e4e4e7",
    fontSize: 14,
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      style={{ maxWidth: 560 }}
    >
      <div style={blockStyle}>
        <span style={labelStyle}>Signal types</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SIGNAL_TYPES.map((t) => (
            <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, color: "#d4d4d8", fontSize: 14, cursor: "pointer" }}>
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

      <div style={blockStyle}>
        <span style={labelStyle}>Actions</span>
        <div style={{ display: "flex", gap: 16 }}>
          {ACTIONS.map((a) => (
            <label key={a} style={{ display: "flex", alignItems: "center", gap: 6, color: "#d4d4d8", fontSize: 14, cursor: "pointer" }}>
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

      <div style={blockStyle}>
        <label style={labelStyle}>Minimum confidence</label>
        <select
          value={prefs.min_confidence}
          onChange={(e) => setPrefs((p) => ({ ...p, min_confidence: e.target.value }))}
          style={{ ...inputStyle, minWidth: 140 }}
        >
          {CONFIDENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Timezone</label>
        <select
          value={TIMEZONES.includes(prefs.timezone) ? prefs.timezone : ""}
          onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value || p.timezone }))}
          style={{ ...inputStyle, minWidth: 220 }}
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
            style={{ ...inputStyle, marginTop: 8, width: "100%", maxWidth: 280 }}
          />
        )}
      </div>

      <div style={blockStyle}>
        <label style={labelStyle}>Daily digest time (local)</label>
        <input
          type="time"
          value={prefs.digest_time_local}
          onChange={(e) => setPrefs((p) => ({ ...p, digest_time_local: e.target.value }))}
          style={inputStyle}
        />
        <span style={{ marginLeft: 8, color: "#71717a", fontSize: 12 }}>24h format</span>
      </div>

      <div style={blockStyle}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#d4d4d8", fontSize: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={prefs.digest_enabled}
            onChange={(e) => setPrefs((p) => ({ ...p, digest_enabled: e.target.checked }))}
          />
          Digest enabled (receive scheduled daily digest)
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            backgroundColor: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {saveMessage && (
          <span style={{ color: saveMessage.startsWith("Preferences") ? "#86efac" : "#fca5a5", fontSize: 14 }}>
            {saveMessage}
          </span>
        )}
      </div>

      <div style={{ ...blockStyle, borderColor: "#52525b" }}>
        <span style={labelStyle}>Test digest</span>
        <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 12 }}>
          Send the digest for the last 24 hours to your email now (ignores schedule).
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={sending}
            style={{
              padding: "8px 16px",
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              border: "1px solid #52525b",
              borderRadius: 6,
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Sending…" : "Send test digest now"}
          </button>
          <Link
            href="/digest/preview"
            style={{ color: "#3b82f6", fontSize: 14 }}
          >
            Preview digest
          </Link>
          {sendMessage && (
            <span style={{ color: sendMessage.startsWith("Digest") || sendMessage.includes("24 hours") ? "#86efac" : "#fca5a5", fontSize: 14 }}>
              {sendMessage}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
