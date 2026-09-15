import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseSprintsQuery } from "@/schemas/list-queries";
import { parseSprintCreateBody } from "@/schemas/sprint-mutations";
import { createSprint, listSprints } from "@/services/sprint.service";
import {
  createdResponse,
  internalErrorResponse,
  mutationFailureResponse,
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

/**
 * POST /api/sprints — create a sprint in an accessible project.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Authorization: ADMIN / PROJECT_MANAGER of the owning organization only
 * (DEVELOPER → 403 — no sprint INSERT policy). The project is verified
 * server-side through RLS; inaccessible projects share the same 404 (no
 * oracle). No `organizationId` is accepted — ownership is derived from the
 * project.
 * Body: `projectId` + `name` required; `goal`, `status`
 * (planning/active/completed/cancelled), `startDate`/`start_date`,
 * `endDate`/`end_date` (end on or after start), `totalPoints`/`total_points`,
 * `completedPoints`/`completed_points` optional.
 * Returns 201 with the created row.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("POST /api/sprints auth failed:", error);
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
    console.error("POST /api/sprints scope failed:", error);
    return internalErrorResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse([
      { field: "body", message: "Request body must be valid JSON" },
    ]);
  }

  const parsed = parseSprintCreateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await createSprint(
      context.supabase,
      scope,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return createdResponse(result.data);
  } catch (error) {
    console.error("POST /api/sprints failed:", error);
    return internalErrorResponse();
  }
}
