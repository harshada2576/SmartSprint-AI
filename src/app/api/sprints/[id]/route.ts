import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseSprintUpdateBody } from "@/schemas/sprint-mutations";
import { updateSprint } from "@/services/sprint.service";
import { isUuid } from "@/schemas/query-params";
import {
  internalErrorResponse,
  mutationFailureResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/sprints/:id — edit an accessible sprint.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: missing and out-of-scope rows share the same 404 (no oracle).
 * Authorization: ADMIN / PROJECT_MANAGER of the owning organization only
 * (DEVELOPER → 403 — no sprint UPDATE policy). `projectId` moves are
 * rejected with 400 (sprints never move projects; the
 * `trg_sprints_forbid_cross_org_move` trigger backstops this);
 * `organizationId` transfers are rejected with 403.
 * Body: any subset of the POST fields except `projectId` (at least one
 * required); inverted date ranges are rejected with 400, including partial
 * updates merged against the stored row.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("PATCH /api/sprints/:id auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context: authContext } = auth;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return validationErrorResponse([
      { field: "id", message: "Sprint id must be a valid UUID" },
    ]);
  }

  let scope;
  try {
    scope = await resolveRequestScope(authContext.supabase, authContext.user.id);
  } catch (error) {
    console.error("PATCH /api/sprints/:id scope failed:", error);
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

  const parsed = parseSprintUpdateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await updateSprint(
      authContext.supabase,
      scope,
      id,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return successResponse(result.data);
  } catch (error) {
    console.error("PATCH /api/sprints/:id failed:", error);
    return internalErrorResponse();
  }
}
