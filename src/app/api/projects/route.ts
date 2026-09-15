import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { parseProjectsQuery } from "@/schemas/list-queries";
import { listProjects } from "@/services/project.service";
import {
  buildPaginationMeta,
  internalError,
  success,
  validationError,
} from "@/utils/api-response";

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
    console.error("GET /api/projects scope failed:", error);
    return internalError();
  }

  const parsed = parseProjectsQuery(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return validationError(parsed.details);
  }

  try {
    const { rows, total } = await listProjects(
      context.supabase,
      scope,
      parsed.value,
    );
    return success(rows, buildPaginationMeta(parsed.value, total));
  } catch (error) {
    console.error("GET /api/projects failed:", error);
    return internalError();
  }
}
