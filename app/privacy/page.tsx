import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for CRE Signal Engine.",
  openGraph: {
    title: "Privacy Policy — CRE Signal Engine",
    description: "How CRE Signal Engine handles your data.",
    url: `${getSiteUrl()}/privacy`,
  },
  alternates: {
    canonical: `${getSiteUrl()}/privacy`,
  },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="max-w-[720px] mx-auto p-6">
      <h1 className="text-[28px] font-bold text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-muted-foreground mb-6">
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>
      <div className="text-foreground text-[15px] leading-relaxed">
        <p>
          We collect only what is needed to provide the service: account information, usage data,
          and content you submit for analysis. We do not sell your data.
        </p>
        <p className="mt-4">
          Authentication and data storage are handled by Supabase; payments by Stripe.
          See their respective privacy policies for details.
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
