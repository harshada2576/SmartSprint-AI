import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProvisioned } from "@/lib/auth/organization";

/**
 * Supabase Auth callback: exchanges the OAuth / email-confirmation /
 * recovery `code` for a session, ensures the application profile +
 * organization exist, then redirects.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=session_expired", url.origin));
  }

  // Recovery links land on /reset-password with a valid session; the user
  // sets the new password there, so no provisioning is needed first.
  if (next.startsWith("/reset-password")) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  try {
    await ensureUserProvisioned(supabase, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "account_exists") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=account_exists", url.origin));
    }
    if (message === "oauth_no_email") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=oauth_no_email", url.origin));
    }
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=provisioning_failed", url.origin)
    );
  }

  const redirectTo = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
