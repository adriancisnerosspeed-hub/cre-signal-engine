import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/app";
  const origin = requestUrl.origin;
  const loginUrl = `${origin}/login`;

  if (!code) {
    return NextResponse.redirect(`${loginUrl}?error=missing`);
  }

  const supabase = await createClient();
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
  return NextResponse.redirect(`${origin}${redirectTo}`);
}
