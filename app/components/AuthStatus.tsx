"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type User = {
  email?: string;
} | null;

export default function AuthStatus() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 16, fontSize: 14, color: "#666" }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <Link
          href="/login"
          style={{
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "#000",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 4,
            display: "inline-block",
          }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, color: "#666" }}>
        Signed in as <strong>{user.email}</strong>
      </span>
      <Link
        href="/app"
        style={{
          padding: "8px 16px",
          fontSize: 14,
          backgroundColor: "#f0f0f0",
          color: "#000",
          textDecoration: "none",
          borderRadius: 4,
          border: "1px solid #ddd",
        }}
      >
        Dashboard
      </Link>
      <button
        onClick={handleSignOut}
        style={{
          padding: "8px 16px",
          fontSize: 14,
          backgroundColor: "#fff",
          color: "#000",
          border: "1px solid #ddd",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
