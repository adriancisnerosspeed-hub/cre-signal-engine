"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const navStyle = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  padding: "12px 24px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  backgroundColor: "var(--background)",
  flexWrap: "wrap" as const,
};
const linkStyle = {
  color: "var(--foreground)",
  textDecoration: "none",
  fontSize: 14,
  opacity: 0.9,
};
const activeLinkStyle = { ...linkStyle, fontWeight: 600, opacity: 1 };
const buttonStyle = {
  padding: "6px 12px",
  fontSize: 14,
  background: "transparent",
  color: "var(--foreground)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 4,
  cursor: "pointer" as const,
  opacity: 0.9,
};

export default function AppNav() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
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

  // Public-only nav when not logged in (bot-safe; no redirect)
  if (!user) {
    return (
      <nav style={navStyle}>
        <Link href="/" style={pathname === "/" ? activeLinkStyle : linkStyle}>Home</Link>
        <Link href="/pricing" style={pathname === "/pricing" ? activeLinkStyle : linkStyle}>Pricing</Link>
        <Link href="/login" style={{ ...linkStyle, marginLeft: "auto", fontWeight: 600 }}>Sign in</Link>
      </nav>
    );
  }

  return (
    <nav style={navStyle}>
      <Link href="/" style={pathname === "/" ? activeLinkStyle : linkStyle}>Home</Link>
      <Link href="/app" style={pathname === "/app" ? activeLinkStyle : linkStyle}>Dashboard</Link>
      <Link href="/analyze" style={pathname === "/analyze" ? activeLinkStyle : linkStyle}>Analyze</Link>
      <Link href="/pricing" style={pathname === "/pricing" ? activeLinkStyle : linkStyle}>Pricing</Link>
      <Link href="/digest/preview" style={pathname === "/digest/preview" ? activeLinkStyle : linkStyle}>Digest</Link>
      <Link href="/settings" style={pathname === "/settings" ? activeLinkStyle : linkStyle}>Settings</Link>
      <button type="button" onClick={handleSignOut} style={{ ...buttonStyle, marginLeft: "auto" }}>
        Sign out
      </button>
    </nav>
  );
}
