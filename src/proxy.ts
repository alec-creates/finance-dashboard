import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE_PREFIX,
  PUBLIC_PATHS,
  SIGN_IN_PATH,
} from "@/server/auth/constants";

/**
 * Optimistic check only: requests without a session cookie are redirected (pages) or rejected (API) before any page
 * renders. It does not validate the session; pages and route handlers do that against the database.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/api/auth/") ||
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  if (isPublic) {
    return NextResponse.next();
  }
  if (getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
