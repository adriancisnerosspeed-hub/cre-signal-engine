import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * No-op middleware. Public routes (see lib/publicRoutes.ts) must NOT be
 * protected here. Do not add redirects of / or /pricing or /login to /login.
 * Stripe and bots need / to load with no cookies.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and _next.
     * We do not redirect or block any route; this exists only to document
     * that public routes must stay public.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
