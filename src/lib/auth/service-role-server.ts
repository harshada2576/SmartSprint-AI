import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("service-role-server is server-only and must never run in the browser.");
  }
}

export function getServiceRoleClient(): SupabaseClient {
  assertServerOnly();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("service_role_configuration_missing");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
