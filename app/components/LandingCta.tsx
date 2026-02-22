"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** CTAs for landing. Auth state is client-only so / renders with no server auth (bot-safe). */
export default function LandingCta() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
      setMounted(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // SSR and initial render: show public CTA (no cookies / bot-safe)
  if (!mounted) {
    return (
      <Link href="/login" className="landing-cta primary">
        Get Started
      </Link>
    );
  }

  if (isLoggedIn) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/app" className="landing-cta primary">
          Dashboard
        </Link>
        <Link href="/pricing" className="landing-cta secondary">
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  return (
    <Link href="/login" className="landing-cta primary">
      Get Started
    </Link>
  );
}
