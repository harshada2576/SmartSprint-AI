import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { RequirementsQuery } from "@/schemas/list-queries";
import {
  listRequirementsScoped,
  type ListRequirementsResult,
} from "@/repositories/requirement.repository";

/**
 * Requirement service — business-logic seam between API routes and
 * repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read-only by design (see `project.service.ts`): `null` propagates the
 * "scoped project not accessible" signal so the route returns 404 without
 * leaking existence. Future mutations must respect the staff-only write
 * gates (developers may only touch self-assigned rows, never reassign).
 */
export async function listRequirements(
  client: SupabaseClient,
  scope: RequestScope,
  filters: RequirementsQuery,
): Promise<ListRequirementsResult | null> {
  return listRequirementsScoped(client, scope, filters);
}
