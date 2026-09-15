import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for client-side auth/session operations.
 *
 * Uses the publishable anon key only. Never import service-role credentials
 * or server-only helpers into browser code.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(url, anonKey);
}
