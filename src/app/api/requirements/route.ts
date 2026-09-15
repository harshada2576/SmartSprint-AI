import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseRequirementsQuery } from "@/schemas/list-queries";
import { parseRequirementCreateBody } from "@/schemas/requirement-mutations";
import {
  createRequirement,
  listRequirements,
} from "@/services/requirement.service";
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
 * GET /api/requirements — requirements in projects accessible to the
 * authenticated caller (scoped project → organization → membership).
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Scope: `projectId` is verified server-side; an inaccessible project yields
 * 404 (missing and forbidden are indistinguishable — no existence oracle).
 * An inaccessible `sprintId` fails closed to an empty list. Cross-project /
 * cross-org access is denied by this check plus RLS.
 * Filters: `projectId`, `sprintId`, `status`, `priority`, `search`,
 * `page`, `pageSize` (`limit` alias, max 100).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/requirements auth failed:", error);
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
    console.error("GET /api/requirements scope failed:", error);
    return internalErrorResponse();
  }

  const parsed = parseRequirementsQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await listRequirements(
      context.supabase,
      scope,
      parsed.value,
    );
    if (result === null) {
      return notFoundResponse("Project not found");
    }
    return successResponse(result.rows, {
      pagination: buildPaginationMeta(parsed.value, result.total),
    });
  } catch (error) {
    console.error("GET /api/requirements failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/requirements — create a requirement in an accessible project.
 *
 * Auth: 401 `UNAUTHENTICATED` without a valid Supabase session/JWT.
 * Authorization: ADMIN / PROJECT_MANAGER of the owning organization only
 * (DEVELOPER → 403 — no INSERT policy). The project is verified server-side
 * through RLS; inaccessible projects share the same 404 (no oracle). No
 * `organizationId` is accepted — ownership is derived from the project.
 * `display_id` is server-generated (`<PROJECT_CODE>-NNN`, project-scoped
 * unique); client values are ignored. `assigneeId` must be an org member,
 * `sprintId`/`dependencyId` must belong to the same project (400 otherwise).
 * Body: `projectId` + `title` + `category` required; `description`,
 * `businessValue`, `priority`, `status`, `assigneeId`, `sprintId`,
 * `customerImportance`, `urgency`, `complexity`, `estimatedEffort`, `risk`,
 * `storyPoints`, `dependencyId` optional.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("POST /api/requirements auth failed:", error);
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
    console.error("POST /api/requirements scope failed:", error);
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

  const parsed = parseRequirementCreateBody(body);
  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const result = await createRequirement(
      context.supabase,
      scope,
      parsed.value,
    );
    if (!result.ok) {
      return mutationFailureResponse(result.failure);
    }
    return createdResponse(result.data);
  } catch (error) {
    console.error("POST /api/requirements failed:", error);
    return internalErrorResponse();
  }
}
