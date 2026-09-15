import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseProjectsQuery } from "@/schemas/list-queries";
import { parseProjectCreateBody } from "@/schemas/project-mutations";
import { createProject, listProjects } from "@/services/project.service";
import {
  createdResponse,
  internalErrorResponse,
  mutationFailureResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { buildPaginationMeta } from "@/api/pagination";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects — projects accessible to the authenticated caller.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: derived server-side from `organization_members` (never from
 * browser-supplied org/role claims); RLS + an explicit organization filter
 * restrict rows. Arbitrary organization switching via query params is not
 * possible (`organization_id` params are ignored).
 * Filters: `status`, `search`, `page`, `pageSize` (`limit` alias, max 100).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/projects auth failed:", error);
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
    console.error("GET /api/projects scope failed:", error);
    return internalErrorResponse();
  }

  const parsed = parseProjectsQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const { rows, total } = await listProjects(
      context.supabase,
      scope,
      parsed.value,
    );
    return successResponse(rows, {
      pagination: buildPaginationMeta(parsed.value, total),
    });
  } catch (error) {
    console.error("GET /api/projects failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/projects — create one project in the caller's organization.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Authorization: ADMIN / PROJECT_MANAGER in the target organization;
 * DEVELOPER (and membership-less callers) receive 403 `FORBIDDEN`.
 * Organization is derived server-side from `organization_members` (never
 * from browser-supplied org/role claims). A body `organizationId` is only
 * a selector verified against the caller's staff orgs — foreign values are
 * rejected with 403 and never trusted as authority.
 * Body: `name` (required), `code` (optional — auto-generated per-org-unique
 * when absent; `UNIQUE(organization_id, code)` collisions answer 400),
 * `description`, `client`, `method`, `status`, `priority`, `progress`,
 * `startDate`/`start_date`, `endDate`/`end_date`,
 * `budgetTotal`/`budget_total`, `budgetCurrency`/`budget_currency`,
 * `managerId`/`manager_id` (must already belong to the organization).
 * Returns 201 with the created row.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("POST /api/projects auth failed:", error);
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
    console.error("POST /api/projects scope failed:", error);
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

  const parsed = parseProjectCreateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await createProject(
      context.supabase,
      scope,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return createdResponse(result.data);
  } catch (error) {
    console.error("POST /api/projects failed:", error);
    return internalErrorResponse();
  }
}
