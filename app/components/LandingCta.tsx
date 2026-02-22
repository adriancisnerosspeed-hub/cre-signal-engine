"use client";

import Link from "next/link";

export default function LandingCta({ isLoggedIn }: { isLoggedIn: boolean }) {
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
