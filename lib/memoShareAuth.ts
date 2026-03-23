import crypto from "crypto";

const COOKIE_NAME = "memo_share_unlock";

if (!process.env.MEMO_SHARE_COOKIE_SECRET) {
  console.warn("[memoShareAuth] MEMO_SHARE_COOKIE_SECRET not set — falling back to service role key. Set a dedicated secret in production.");
}

function secret(): string {
  return (
    process.env.MEMO_SHARE_COOKIE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function signMemoShareUnlock(token: string): string {
  const s = secret();
  if (!s) return "";
  return crypto.createHmac("sha256", s).update(`memo_share:${token}`).digest("hex");
}

export function verifyMemoShareUnlockCookie(token: string, cookieValue: string | undefined): boolean {
  if (!cookieValue || !token) return false;
  const expected = signMemoShareUnlock(token);
  if (!expected) return false;
  try {
    const a = Buffer.from(cookieValue, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
