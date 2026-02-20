"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
    } else {
      setMessage({
        type: "success",
        text: "Check your email for the magic link!",
      });
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "100px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>
        CRE Signal Engine
      </h1>
      <p style={{ marginBottom: 24, color: "#666" }}>
        Sign in with your email to get started.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 16,
            border: "1px solid #ddd",
            borderRadius: 4,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={loading || !email}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 16,
            backgroundColor: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || !email ? 0.6 : 1,
          }}
        >
          {loading ? "Sending..." : "Send Magic Link"}
        </button>
      </form>

      {message && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 4,
            backgroundColor: message.type === "error" ? "#fee" : "#efe",
            color: message.type === "error" ? "#c33" : "#3c3",
          }}
        >
          {message.text}
        </div>
      )}
    </main>
  );
}
