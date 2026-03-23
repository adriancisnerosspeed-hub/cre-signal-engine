import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in or create an account to run deal scans, portfolio governance, and IC-ready exports.",
  openGraph: {
    title: "Sign in — CRE Signal Engine",
    description: "Access your workspace for CRE risk governance and deal scans.",
    url: `${getSiteUrl()}/login`,
  },
  alternates: {
    canonical: `${getSiteUrl()}/login`,
  },
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
