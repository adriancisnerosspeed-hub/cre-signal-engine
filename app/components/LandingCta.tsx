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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // SSR and initial render: show public CTAs (no cookies / bot-safe)
  if (!mounted) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
        <Link href="/login" className="landing-cta primary">
          Get Started
        </Link>
        <Link href="/login?eval=true" className="landing-cta secondary">
          Start Free Evaluation (3 scans)
        </Link>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
        <Link href="/app" className="landing-cta primary">
          Go to Dashboard
        </Link>
        <Link href="/app/methodology" className="landing-cta secondary">
          View Methodology
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
      <Link href="/login" className="landing-cta primary">
        Get Started
      </Link>
      <Link href="/login?eval=true" className="landing-cta secondary">
        Start Free Evaluation (3 scans)
      </Link>
    </div>
  );
}
