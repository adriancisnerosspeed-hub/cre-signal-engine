import { createServerClient } from "@supabase/ssr";
import { ensureProfile } from "@/lib/auth";
import { NextResponse } from "next/server";
import { parse as parseCookieHeader } from "cookie";

/** Base URL for redirects. Prefer env so Vercel/proxies don't send user to wrong host. */
function getRedirectBase(request: Request): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base && base.startsWith("http")) return base.replace(/\/$/, "");
  const requestUrl = new URL(request.url);
  return requestUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/app";
  const base = getRedirectBase(request);
  const loginUrl = `${base}/login`;

  if (!code) {
    return NextResponse.redirect(`${loginUrl}?error=missing`, 303);
  }

  const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const cookieHeader = request.headers.get("cookie") ?? "";
  const parsed = parseCookieHeader(cookieHeader);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(parsed).map(([name, value]) => ({ name, value: value ?? "" }));
        },
        setAll(cookies) {
          cookies.forEach((c) => cookiesToSet.push({ name: c.name, value: c.value, options: c.options }));
        },
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorMessage = encodeURIComponent(error.message || "Sign-in failed.");
    return NextResponse.redirect(`${base}/auth/error?message=${errorMessage}`, 303);
  }

  if (session?.user) {
    try {
      await ensureProfile(supabase, session.user);
    } catch {
      // Don't block sign-in if profile upsert fails
    }
  }

  const redirectTo = next.startsWith("/") ? next : "/app";
  const response = NextResponse.redirect(`${base}${redirectTo}`, 303);

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      path: "/",
      ...(options as Record<string, unknown>),
    });
  });

  return response;
}
