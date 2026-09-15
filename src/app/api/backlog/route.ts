import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { parsePagination } from "@/api/pagination";
import {
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
} from "@/api/response";
import { validateBacklogQuery } from "@/schemas/backlog-query";
import { listBacklogItems } from "@/repositories/backlog.repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/backlog — authenticated, project-scoped backlog listing.
 *
 * Auth: 401 UNAUTHENTICATED without a verified Supabase session (cookie)
 * or Bearer token. Scope comes from RLS (`backlog_select_staff` for
 * ADMIN/PROJECT_MANAGER org-wide, `backlog_select_member` for DEVELOPER
 * project membership) evaluated as the caller — never from client-supplied
 * user/org/role claims. An explicit `projectId` outside the caller's scope
 * is rejected with 403 FORBIDDEN (same answer as a non-existent project).
 * Always paginated (`?page=1&pageSize=20`, pageSize clamped to 100).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) {
      return auth.response;
    }
    const { supabase } = auth.context;

    const searchParams = request.nextUrl.searchParams;

    const pagination = parsePagination(searchParams);
    if ("response" in pagination) {
      return pagination.response;
    }

    const validated = validateBacklogQuery(searchParams);
    if ("response" in validated) {
      return validated.response;
    }
    const { filters } = validated;

    if (filters.projectId) {
      const accessible = await isProjectAccessible(
        supabase,
        filters.projectId,
      );
      if (!accessible) {
        return forbiddenResponse();
      }
    }

    const result = await listBacklogItems(supabase, {
      projectId: filters.projectId,
      status: filters.status,
      priority: filters.priority,
      search: filters.search,
      page: pagination.params.page,
      pageSize: pagination.params.pageSize,
    });

    return successResponse(result.items, {
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("GET /api/backlog failed:", error);
    return internalErrorResponse();
  }
}
