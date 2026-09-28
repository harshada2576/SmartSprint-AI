import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseProjectUpdateBody } from "@/schemas/project-mutations";
import { getProjectById, updateProject } from "@/services/project.service";
import { isUuid } from "@/schemas/query-params";
import {
  internalErrorResponse,
  mutationFailureResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id — one accessible project.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: derived server-side from `organization_members` (never from
 * browser-supplied org/role claims); RLS + an explicit organization check
 * restrict rows. Missing and inaccessible projects share the same 404 (no
 * existence oracle). Read-only: every role with project visibility
 * (including DEVELOPER) may read.
 * Returns the full project row (same shape as the collection endpoint,
 * compatible with the frontend `normalizeProject()`).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/projects/:id auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context: authContext } = auth;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return validationErrorResponse([
      { field: "id", message: "Project id must be a valid UUID" },
    ]);
  }

  let scope;
  try {
    scope = await resolveRequestScope(authContext.supabase, authContext.user.id);
  } catch (error) {
    console.error("GET /api/projects/:id scope failed:", error);
    return internalErrorResponse();
  }

  try {
    const row = await getProjectById(authContext.supabase, scope, id);
    if (!row) {
      return notFoundResponse("Project not found");
    }
    return successResponse(row);
  } catch (error) {
    console.error("GET /api/projects/:id failed:", error);
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/projects/:id — edit an accessible project.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: the project must be visible to the caller through RLS; missing and
 * forbidden projects share the same 404 (no existence oracle). Only
 * ADMIN / PROJECT_MANAGER of the owning organization may write
 * (DEVELOPER → 403, even on member projects).
 * Guards: `organizationId` moves are rejected with 403 (trigger backstop);
 * membership tables are never touched here; `managerId` changes are allowed
 * only to existing organization members (RLS re-enforces).
 * Body: any subset of the POST fields (at least one required); `code`
 * changes respect `UNIQUE(organization_id, code)` → 400 on collision.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("PATCH /api/projects/:id auth failed:", error);
    return internalErrorResponse();
  }
  if (!auth.ok) {
    return auth.response;
  }
  const { context: authContext } = auth;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return validationErrorResponse([
      { field: "id", message: "Project id must be a valid UUID" },
    ]);
  }

  let scope;
  try {
    scope = await resolveRequestScope(authContext.supabase, authContext.user.id);
  } catch (error) {
    console.error("PATCH /api/projects/:id scope failed:", error);
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

  const parsed = parseProjectUpdateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await updateProject(
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
    console.error("PATCH /api/projects/:id failed:", error);
    return internalErrorResponse();
  }
}
