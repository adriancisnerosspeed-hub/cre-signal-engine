"use client";

import { useState, useCallback } from "react";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

export default function DigestPreviewClient() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetchJsonWithTimeout("/api/digest/send-now", { method: "POST" }, 15000);
      const data = res.json;
      if (!res.ok) throw new Error((data?.error as string) || (data?.message as string) || "Send failed");
      setMessage((data?.message as string) || "Risk Brief sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <div className="p-3 bg-card border border-border rounded-lg mb-4">
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="px-4 py-2 bg-muted/50 text-foreground border border-border rounded-md disabled:cursor-not-allowed cursor-pointer font-medium"
      >
        {sending ? "Sending\u2026" : "Send test Risk Brief now"}
      </button>
      {message && (
        <span className={`ml-3 text-sm ${message.startsWith("Risk Brief") || message.includes("24 hours") ? "text-[#86efac]" : "text-[#fca5a5]"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
