import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/proxy";

/**
 * Next.js proxy (Next 16 file convention): refreshes the Supabase session on
 * every request and enforces authentication for application routes.
 *
 * - Unauthenticated users visiting protected routes -> /login
 * - Authenticated users visiting auth pages -> /dashboard
 * - Public: /, /auth/*, API routes, static assets
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/requirements",
  "/ai-recommendations",
  "/backlog",
  "/sprint-planning",
  "/sprint-board",
  "/execution",
  "/monitoring",
  "/reports",
  "/documents",
  "/governance",
  "/notifications",
  "/team",
  "/settings",
  "/calendar",
];

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

function matches(pathname: string, entries: string[]): boolean {
  return entries.some(
    (entry) => pathname === entry || pathname.startsWith(`${entry}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let session;
  try {
    session = await updateSession(request);
  } catch {
    // If Supabase is unreachable/misconfigured, fail closed on protected
    // routes and let public routes render.
    if (matches(pathname, PROTECTED_PREFIXES)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  const { response, user } = session;

  if (!user && matches(pathname, PROTECTED_PREFIXES)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
