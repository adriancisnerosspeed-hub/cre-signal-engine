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

type CurrentOrg = { id: string; name: string } | null;

export default function AppNav() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [currentOrg, setCurrentOrg] = useState<CurrentOrg>(null);
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

  useEffect(() => {
    if (!user) {
      setCurrentOrg(null);
      return;
    }
    fetch("/api/org/current")
      .then((r) => r.json())
      .then((data) => {
        if (data.id && data.name) setCurrentOrg({ id: data.id, name: data.name });
        else setCurrentOrg(null);
      })
      .catch(() => setCurrentOrg(null));
  }, [user]);

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
      <Link href="/app/deals" style={pathname?.startsWith("/app/deals") ? activeLinkStyle : linkStyle}>Deals</Link>
      <Link href="/analyze" style={pathname === "/analyze" ? activeLinkStyle : linkStyle}>Analyze</Link>
      <Link href="/pricing" style={pathname === "/pricing" ? activeLinkStyle : linkStyle}>Pricing</Link>
      <Link href="/digest/preview" style={pathname === "/digest/preview" ? activeLinkStyle : linkStyle}>Digest</Link>
      <Link href="/app/portfolio" style={pathname === "/app/portfolio" ? activeLinkStyle : linkStyle}>Portfolio</Link>
      <Link href="/app/methodology" style={pathname === "/app/methodology" ? activeLinkStyle : linkStyle}>Methodology</Link>
      <Link href="/settings" style={pathname === "/settings" ? activeLinkStyle : linkStyle}>Settings</Link>
      {currentOrg && (
        <span style={{ fontSize: 13, opacity: 0.85, marginLeft: "auto", marginRight: 12 }}>
          Workspace: {currentOrg.name}
        </span>
      )}
      <button type="button" onClick={handleSignOut} style={{ ...buttonStyle, marginLeft: currentOrg ? 0 : "auto" }}>
        Sign out
      </button>
    </nav>
  );
}
