"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const callbackError = useMemo(() => {
    const error = searchParams.get("error");
    if (error === "expired") return "That link expired or is invalid. Please request a new link.";
    if (error === "invalid") return "That link is invalid. Please request a new link.";
    if (error === "missing") return "No sign-in code was received. Please request a new link.";
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (callbackError) setMessage({ type: "error", text: callbackError });
  }, [callbackError]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push("/app");
    });
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: "Check your email for the magic link! After clicking it, you'll be redirected to the app.",
      });
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 400, margin: "100px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>CRE Signal Engine</h1>
      <p style={{ marginBottom: 24, color: "#666" }}>Sign in with your email to get started.</p>
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
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/" style={{ fontSize: 14, color: "#666", textDecoration: "underline" }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 400, margin: "100px auto", padding: 24, textAlign: "center" }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
