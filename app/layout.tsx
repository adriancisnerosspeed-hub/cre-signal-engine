import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "./components/AppNav";
import { Providers } from "./providers";
import { getSiteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CRE Signal Engine",
    template: "%s | CRE Signal Engine",
  },
  description:
    "Deterministic CRE risk governance: versioned Risk Index, snapshot benchmarks, portfolio policies, and IC-ready exports.",
  applicationName: "CRE Signal Engine",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "CRE Signal Engine",
    title: "CRE Signal Engine",
    description:
      "Institutional risk governance for commercial real estate — deterministic scoring, frozen benchmarks, auditable exports.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CRE Signal Engine",
    description:
      "Institutional risk governance for commercial real estate underwriting.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-black text-gray-900 dark:text-white`}
      >
        <Providers>
          <AppNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
