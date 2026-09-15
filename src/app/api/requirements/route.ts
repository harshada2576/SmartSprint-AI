import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseRequirementsQuery } from "@/schemas/list-queries";
import { listRequirements } from "@/services/requirement.service";
import {
  buildPaginationMeta,
  internalError,
  notFound,
  success,
  validationError,
} from "@/utils/api-response";

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
    return internalError();
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
    return internalError();
  }

  const parsed = parseRequirementsQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationError(parsed.details);
  }

  try {
    const result = await listRequirements(
      context.supabase,
      scope,
      parsed.value,
    );
    if (result === null) {
      return notFound("Project not found");
    }
    return success(result.rows, buildPaginationMeta(parsed.value, result.total));
  } catch (error) {
    console.error("GET /api/requirements failed:", error);
    return internalError();
  }
}
