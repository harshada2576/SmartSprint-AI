import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "@/types/api";
import type { ProjectsQuery } from "@/schemas/list-queries";
import {
  listProjectsScoped,
  type ListProjectsResult,
} from "@/repositories/project.repository";

/**
 * Project service — business-logic seam between API routes and repositories.
 *
 * Ownership: Backend/API agent (`src/services/**`).
 *
 * Currently read-only by design: the existing frontend/backend architecture
 * (mock-driven pages, no mutation callers) requires only authenticated list
 * access, so no new mutation endpoints are invented here. Future mutations
 * must take the user-scoped client + `RequestScope` and enforce the
 * ADMIN/PROJECT_MANAGER/DEVELOPER write gates from the RLS foundation
 * (staff-only project writes; developers have no project write path).
 */
export async function listProjects(
  client: SupabaseClient,
  scope: RequestScope,
  filters: ProjectsQuery,
): Promise<ListProjectsResult> {
  return listProjectsScoped(client, scope, filters);
}
