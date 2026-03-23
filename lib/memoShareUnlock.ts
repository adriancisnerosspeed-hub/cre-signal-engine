import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyMemoShareUnlockCookie } from "@/lib/memoShareAuth";

/** Server components: cookie-only unlock (no password in URL). */
export async function isMemoShareUnlockedFromCookie(
  token: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  if (!passwordHash) return true;
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(COOKIE_NAME)?.value;
  return verifyMemoShareUnlockCookie(token, cookieVal);
}

/** API routes: cookie or X-Share-Password header (bcrypt). */
export async function isMemoShareUnlockedFromRequest(
  token: string,
  passwordHash: string | null | undefined,
  request: Request
): Promise<boolean> {
  if (!passwordHash) return true;
  if (await isMemoShareUnlockedFromCookie(token, passwordHash)) return true;
  const headerPw = request.headers.get("x-share-password") ?? "";
  if (headerPw.length === 0) return false;
  return compare(headerPw, passwordHash);
}
