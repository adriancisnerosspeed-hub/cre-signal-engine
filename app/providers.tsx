"use client";

import { ThemeProvider } from "next-themes";
import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
    });
  }, []);

  const hasPostHog = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {hasPostHog ? (
        <PostHogProvider client={posthog}>
          {children}
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
        </PostHogProvider>
      ) : (
        children
      )}
    </ThemeProvider>
  );
}
