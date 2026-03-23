import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for CRE Signal Engine.",
  openGraph: {
    title: "Terms of Service — CRE Signal Engine",
    description: "Terms governing use of CRE Signal Engine.",
    url: `${getSiteUrl()}/terms`,
  },
  alternates: {
    canonical: `${getSiteUrl()}/terms`,
  },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="max-w-[720px] mx-auto p-6">
      <h1 className="text-[28px] font-bold text-foreground mb-2">
        Terms of Service
      </h1>
      <p className="text-muted-foreground mb-6">
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>
      <div className="text-foreground text-[15px] leading-relaxed">
        <p>
          By using CRE Signal Engine you agree to use the service in accordance with these terms.
          We reserve the right to update these terms; continued use constitutes acceptance.
        </p>
        <p className="mt-4">
          For billing and subscription terms, see your plan and our payment provider&apos;s policies.
        </p>
      </div>
      <p className="mt-8">
        <Link href="/" className="text-[#3b82f6] text-sm">
          Back to home
        </Link>
      </p>
    </main>
  );
}
