import { createServerClient } from "@supabase/ssr";
import { ensureProfile } from "@/lib/auth";
import { NextResponse } from "next/server";
import { parse as parseCookieHeader } from "cookie";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/app";
  const origin = requestUrl.origin;
  const loginUrl = `${origin}/login`;

  if (!code) {
    return NextResponse.redirect(`${loginUrl}?error=missing`);
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
    const isExpired = error.message?.toLowerCase().includes("expired") ?? false;
    const param = isExpired ? "expired" : "invalid";
    return NextResponse.redirect(`${loginUrl}?error=${param}`);
  }

  if (session?.user) {
    await ensureProfile(supabase, session.user);
  }

  const redirectTo = next.startsWith("/") ? next : "/app";
  const response = NextResponse.redirect(`${origin}${redirectTo}`);

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      path: "/",
      ...(options as Record<string, unknown>),
    });
  });

  return response;
}
