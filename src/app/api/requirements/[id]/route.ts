import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseRequirementUpdateBody } from "@/schemas/requirement-mutations";
import { updateRequirement } from "@/services/requirement.service";
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
 * PATCH /api/requirements/:id — edit an accessible requirement.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: missing and out-of-scope rows share the same 404 (no oracle).
 * Authorization:
 * - ADMIN / PROJECT_MANAGER of the owning org: full staff fields (title,
 *   description, category, businessValue, priority, status, assignee,
 *   sprint, scores, dependency). `assigneeId` must stay in-org;
 *   `sprintId`/`dependencyId` must stay same-project (400 otherwise).
 * - DEVELOPER: only rows currently assigned to themselves, staying assigned
 *   to themselves, same project. Any `assigneeId` in the body → 403 (no
 *   reassignment); `projectId`/`displayId` are immutable (400 on attempt).
 *   Other editable fields (status, priority, title, description, business value,
 *   urgency, complexity, effort, risk, story points, sprint, dependency,
 *   category) follow the same validation as staff.
 * `display_id` / `project_id` are never writable here.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("PATCH /api/requirements/:id auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context: authContext } = auth;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return validationErrorResponse([
      { field: "id", message: "Requirement id must be a valid UUID" },
    ]);
  }

  let scope;
  try {
    scope = await resolveRequestScope(authContext.supabase, authContext.user.id);
  } catch (error) {
    console.error("PATCH /api/requirements/:id scope failed:", error);
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

  const parsed = parseRequirementUpdateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await updateRequirement(
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
    console.error("PATCH /api/requirements/:id failed:", error);
    return internalErrorResponse();
  }
}
