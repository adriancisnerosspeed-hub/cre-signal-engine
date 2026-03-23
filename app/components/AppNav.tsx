"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { identifyAnalyticsUser } from "@/lib/analyticsClient";
import ThemeToggle from "./ThemeToggle";

type CurrentOrg = { id: string; name: string } | null;

export default function AppNav() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
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
    if (user?.id) {
      identifyAnalyticsUser(user.id, {
        email: typeof user.email === "string" ? user.email : undefined,
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCurrentOrg(null);
      return;
    }
    fetchJsonWithTimeout("/api/org/current", {}, 15000)
      .then((r) => {
        const data = r.json as { id?: string; name?: string } | null;
        if (data?.id && data?.name) setCurrentOrg({ id: data.id, name: data.name });
        else setCurrentOrg(null);
      })
      .catch(() => setCurrentOrg(null));
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.reset();
    }
    router.push("/");
    router.refresh();
  }

  const navClassName = "flex items-center gap-5 py-3 px-6 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-black flex-wrap";
  const linkClassName = "text-gray-900 dark:text-white text-sm no-underline opacity-90";
  const activeClassName = "text-gray-900 dark:text-white text-sm no-underline font-semibold opacity-100";
  const buttonClassName = "py-1.5 px-3 text-sm bg-transparent text-gray-900 dark:text-white border border-gray-300 dark:border-white/30 rounded cursor-pointer opacity-90";

  // Public-only nav when not logged in (bot-safe; no redirect)
  if (!user) {
    return (
      <nav className={navClassName}>
        <Link href="/" className={pathname === "/" ? activeClassName : linkClassName}>Home</Link>
        <Link href="/sample-report" className={pathname === "/sample-report" ? activeClassName : linkClassName}>Sample Report</Link>
        <Link href="/pricing" className={pathname === "/pricing" ? activeClassName : linkClassName}>Pricing</Link>
        <span className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={`${linkClassName} font-semibold`}>Sign in</Link>
        </span>
      </nav>
    );
  }

  return (
    <nav className={navClassName}>
      <Link href="/" className={pathname === "/" ? activeClassName : linkClassName}>Home</Link>
      <Link href="/sample-report" className={pathname === "/sample-report" ? activeClassName : linkClassName}>Sample Report</Link>
      <Link href="/app" className={pathname === "/app" ? activeClassName : linkClassName}>Dashboard</Link>
      <Link href="/app/deals" className={pathname?.startsWith("/app/deals") ? activeClassName : linkClassName}>Deals</Link>
      <Link href="/app/portfolio" className={pathname === "/app/portfolio" ? activeClassName : linkClassName}>Portfolio</Link>
      <Link href="/app/policy" className={pathname === "/app/policy" ? activeClassName : linkClassName}>Governance</Link>
      <Link href="/app/governance/dashboard" className={pathname?.startsWith("/app/governance") ? activeClassName : linkClassName}>Governance dashboard</Link>
      <Link href="/app/benchmarks/cohorts" className={pathname?.startsWith("/app/benchmarks") ? activeClassName : linkClassName}>Benchmarks</Link>
      <Link href="/app/methodology" className={pathname === "/app/methodology" ? activeClassName : linkClassName}>Methodology</Link>
      <Link href="/pricing" className={pathname === "/pricing" ? activeClassName : linkClassName}>Pricing</Link>
      <Link href="/digest/preview" className={pathname === "/digest/preview" ? activeClassName : linkClassName}>Risk Brief</Link>
      <Link href="/settings" className={pathname === "/settings" ? activeClassName : linkClassName}>Settings</Link>
      {currentOrg && (
        <span className="text-[13px] opacity-85 ml-auto mr-3 text-gray-600 dark:text-gray-400">
          Workspace: {currentOrg.name}
        </span>
      )}
      <span
        className={`flex items-center gap-2 ${currentOrg ? "" : "ml-auto"}`}
      >
        <ThemeToggle />
        <button type="button" onClick={handleSignOut} className={buttonClassName}>
          Sign out
        </button>
      </span>
    </nav>
  );
}
