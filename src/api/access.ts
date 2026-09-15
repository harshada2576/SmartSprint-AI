import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fail-closed accessibility probes evaluated through the caller's
 * RLS-enforcing client.
 *
 * A probe returns true only when the row is visible to the authenticated
 * caller under the Row Level Security policies (org-staff visibility for
 * ADMIN/PROJECT_MANAGER, explicit project membership for DEVELOPER).
 * Non-existent rows and rows outside the caller's scope are
 * indistinguishable (both return false), so callers can answer FORBIDDEN
 * without creating an existence oracle.
 */
export async function isProjectAccessible(
  client: SupabaseClient,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}

export async function isRequirementAccessible(
  client: SupabaseClient,
  requirementId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("requirements")
    .select("id")
    .eq("id", requirementId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}
