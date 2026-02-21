"use client";

import { useState, useCallback } from "react";

export default function DigestPreviewClient() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/digest/send-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setMessage(data.message || "Digest sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <div
      style={{
        padding: 12,
        backgroundColor: "#18181b",
        border: "1px solid #3f3f46",
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        style={{
          padding: "8px 16px",
          backgroundColor: "#27272a",
          color: "#e4e4e7",
          border: "1px solid #52525b",
          borderRadius: 6,
          cursor: sending ? "not-allowed" : "pointer",
          fontWeight: 500,
        }}
      >
        {sending ? "Sending…" : "Send test digest now"}
      </button>
      {message && (
        <span style={{ marginLeft: 12, color: message.startsWith("Digest") || message.includes("24 hours") ? "#86efac" : "#fca5a5", fontSize: 14 }}>
          {message}
        </span>
      )}
    </div>
  );
}
