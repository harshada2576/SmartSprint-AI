/**
 * Maps Supabase Auth / network errors to safe, user-facing messages.
 * Never surfaces server internals, tokens, or raw error payloads.
 */
export function getAuthErrorMessage(error: unknown): string {
  const raw =
    (typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "")) || "";

  const normalized = raw.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return "Incorrect email or password. Please try again.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please verify your email address before signing in. Check your inbox for the confirmation link.";
  }
  if (
    normalized.includes("user already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("duplicate")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (normalized.includes("password should be")) {
    return "Password does not meet the requirements. Use at least 8 characters with uppercase, lowercase, and a number.";
  }
  if (
    normalized.includes("otp") ||
    normalized.includes("expired") ||
    normalized.includes("invalid") && normalized.includes("link")
  ) {
    return "This link is invalid or has expired. Please request a new one.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("fetch failed")
  ) {
    return "Network error. Check your connection and try again.";
  }
  if (normalized.includes("oauth") || normalized.includes("provider")) {
    return "Google sign-in failed. Please try again or use email and password.";
  }
  if (
    normalized.includes("organization") ||
    normalized.includes("slug")
  ) {
    return "We couldn't set up your organization. Please check the organization name and try again.";
  }
  // Never return raw server output. Even messages mentioning admin/support
  // could carry SQL, keys, or internals from a downstream failure.
  return "Something went wrong. Please try again.";
}

/** Error codes passed via `?error=` query param on auth pages. */
export const AUTH_QUERY_ERRORS: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  oauth_no_email:
    "Google sign-in did not return an email address. Please use email and password.",
  account_exists:
    "An application account with this email already exists. Please sign in with your original method or contact your administrator.",
  session_expired: "Your session expired. Please sign in again.",
  provisioning_failed:
    "Sign-in succeeded but account setup failed. Please try signing in again or contact support.",
};
