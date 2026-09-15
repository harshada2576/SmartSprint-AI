import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseSprintsQuery } from "@/schemas/list-queries";
import { listSprints } from "@/services/sprint.service";
import {
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { buildPaginationMeta } from "@/api/pagination";

export const dynamic = "force-dynamic";

/**
 * GET /api/sprints — sprints in projects accessible to the authenticated
 * caller. Every sprint is verified to belong to an accessible project, both
 * by the server-side project check and by RLS.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: `projectId` is verified server-side; an inaccessible project yields
 * 404 (missing and forbidden are indistinguishable — no existence oracle).
 * Filters: `projectId`, `status`, `page`, `pageSize` (`limit` alias, max 100).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/sprints auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context } = auth;

  let scope;
  try {
    scope = await resolveRequestScope(context.supabase, context.user.id);
  } catch (error) {
    console.error("GET /api/sprints scope failed:", error);
    return internalErrorResponse();
  }

  const parsed = parseSprintsQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await listSprints(context.supabase, scope, parsed.value);
    if (result === null) {
      return notFoundResponse("Project not found");
    }
    return successResponse(result.rows, {
      pagination: buildPaginationMeta(parsed.value, result.total),
    });
  } catch (error) {
    console.error("GET /api/sprints failed:", error);
    return internalErrorResponse();
  }
}
