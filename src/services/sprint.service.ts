import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { SprintsQuery } from "@/schemas/list-queries";
import {
  listSprintsScoped,
  type ListSprintsResult,
} from "@/repositories/sprint.repository";

/**
 * Sprint service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read-only by design (see `project.service.ts`): `null` propagates the
 * "scoped project not accessible" signal so the route returns 404 without
 * leaking existence. Sprint planning writes are PM+ (developers have no
 * sprint write path); no such mutations are introduced here.
 */
export async function listSprints(
  client: SupabaseClient,
  scope: RequestScope,
  filters: SprintsQuery,
): Promise<ListSprintsResult | null> {
  return listSprintsScoped(client, scope, filters);
}
