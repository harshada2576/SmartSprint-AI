import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProvisionedServerOnly } from "@/lib/auth/provision-server";

/**
 * Supabase Auth callback: exchanges the OAuth / email-confirmation /
 * recovery `code` for a session, provisions the application profile +
 * organization through the trusted server lane, then redirects.
 *
 * Provisioning uses the service-role key server-side only (never the
 * browser session client) because RLS intentionally denies organization
 * bootstrap for normal callers. Identity comes from `auth.getUser()` after
 * the code exchange — never from client-supplied parameters.
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
  // Same internal-redirect guard as the final redirect below.
  const isSafeInternal = next.startsWith("/") && !next.startsWith("//");
  if (next.startsWith("/reset-password") && isSafeInternal) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  try {
    await ensureUserProvisionedServerOnly({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    });
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

  const redirectTo = isSafeInternal ? next : "/dashboard";
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
