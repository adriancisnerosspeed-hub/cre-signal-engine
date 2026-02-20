"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginForm() {
  const [mode, setMode] = useState<"password" | "signup">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const callbackError = useMemo(() => {
    const error = searchParams.get("error");
    if (error === "expired") return "That link expired or is invalid. Request a new link.";
    if (error === "invalid") return "That link is invalid. Request a new link.";
    if (error === "missing") return "No sign-in code was received. Request a new link.";
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

  function showError(text: string) {
    setMessage({ type: "error", text });
  }
  function showSuccess(text: string) {
    setMessage({ type: "success", text });
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showError("Please enter your email.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      showError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      showError("Please enter your password.");
      return;
    }
    setLoading(true);
    if (mode === "signup") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        showError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) {
        showError(error.message);
        setLoading(false);
        return;
      }
      if (data?.user && !data?.session) {
        showSuccess("Check your email to confirm your account, then sign in with your password.");
      } else if (data?.session) {
        router.push("/app");
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        showError(error.message);
        setLoading(false);
        return;
      }
      if (data?.session) {
        router.push("/app");
        return;
      }
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      showError(error.message);
      setLoading(false);
      return;
    }
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = magicEmail.trim();
    if (!trimmed) {
      showError("Please enter your email for the magic link.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      showError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      showError(error.message);
    } else {
      showSuccess("Open your email and click the link. You'll return here and be redirected to /app.");
    }
    setLoading(false);
  }

  const fg = "var(--foreground)";
  const muted = "rgba(255,255,255,0.6)";
  const border = "rgba(255,255,255,0.15)";
  const inputBg = "rgba(255,255,255,0.06)";
  const tabInactiveBg = "rgba(255,255,255,0.08)";
  const tabActiveBg = "rgba(255,255,255,0.18)";
  const linkColor = "#7dd3fc";

  const containerStyle = { maxWidth: 400, margin: "40px auto", padding: 24 };
  const inputStyle = {
    width: "100%",
    padding: "12px",
    fontSize: 16,
    border: `1px solid ${border}`,
    borderRadius: 6,
    marginBottom: 12,
    backgroundColor: inputBg,
    color: fg,
  };
  const buttonStyle = {
    width: "100%",
    padding: "12px",
    fontSize: 16,
    border: "none",
    borderRadius: 6,
    cursor: "pointer" as const,
  };

  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: fg }}>CRE Signal Engine</h1>
      <p style={{ marginBottom: 24, color: muted }}>Sign in or create an account.</p>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{
          ...buttonStyle,
          backgroundColor: "rgba(255,255,255,0.12)",
          color: fg,
          border: `1px solid ${border}`,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <div style={{ marginBottom: 16, borderTop: `1px solid ${border}`, paddingTop: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setMode("password"); setMessage(null); }}
            disabled={false}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: mode === "password" ? tabActiveBg : tabInactiveBg,
              color: fg,
              cursor: "pointer",
              fontWeight: mode === "password" ? 600 : 400,
            }}
          >
            Sign in with password
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setMessage(null); }}
            disabled={false}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: mode === "signup" ? tabActiveBg : tabInactiveBg,
              color: fg,
              cursor: "pointer",
              fontWeight: mode === "signup" ? 600 : 400,
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handlePasswordSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={inputStyle}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={inputStyle}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              ...buttonStyle,
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setShowOtherOptions(!showOtherOptions)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 14,
            color: linkColor,
            cursor: "pointer",
            textDecoration: "underline",
            fontWeight: 500,
          }}
        >
          {showOtherOptions ? "Hide other options" : "Other options"}
        </button>
        {showOtherOptions && (
          <form onSubmit={handleMagicLinkSubmit} style={{ marginTop: 12 }}>
            <input
              type="email"
              placeholder="Email for magic link"
              value={magicEmail}
              onChange={(e) => setMagicEmail(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={loading || !magicEmail.trim()}
              style={{
                ...buttonStyle,
                backgroundColor: tabInactiveBg,
                color: fg,
                border: `1px solid ${border}`,
                opacity: loading || !magicEmail.trim() ? 0.6 : 1,
              }}
            >
              Send Magic Link
            </button>
          </form>
        )}
      </div>

      {message && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 6,
            backgroundColor: message.type === "error" ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)",
            color: message.type === "error" ? "#fca5a5" : "#86efac",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/" style={{ fontSize: 14, color: linkColor, textDecoration: "underline" }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 400, margin: "100px auto", padding: 24, textAlign: "center", color: "var(--foreground)" }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
