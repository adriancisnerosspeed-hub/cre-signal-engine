import { createServiceRoleClient } from "@/lib/supabase/service";
import { COOKIE_NAME, signMemoShareUnlock } from "@/lib/memoShareAuth";
import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  const service = createServiceRoleClient();
  const { data: link, error: linkError } = await service
    .from("memo_share_links")
    .select("id, password_hash")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (linkError || !link) {
    return NextResponse.json({ error: "Link not found or revoked" }, { status: 404 });
  }

  const ph = (link as { password_hash?: string | null }).password_hash;
  if (!ph) {
    return NextResponse.json({ error: "This link is not password protected" }, { status: 400 });
  }

  const valid = await compare(password, ph);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const sig = signMemoShareUnlock(token);
  if (!sig) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, sig, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
