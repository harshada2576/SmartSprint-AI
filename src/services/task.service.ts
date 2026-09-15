import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { TasksQuery } from "@/schemas/list-queries";
import {
  listTasksScoped,
  type ListTasksResult,
} from "@/repositories/task.repository";

/**
 * Task service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Read-only by design (see `project.service.ts` and the developer-boundary
 * notes in `task.repository.ts`): `null` propagates the "scoped project not
 * accessible" signal so the route returns 404 without leaking existence. No
 * claim/reassign mutation exists — task assignment stays an ADMIN /
 * PROJECT_MANAGER operation enforced by RLS.
 */
export async function listTasks(
  client: SupabaseClient,
  scope: RequestScope,
  filters: TasksQuery,
): Promise<ListTasksResult | null> {
  return listTasksScoped(client, scope, filters);
}
