import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/api/auth";
import {
  DashboardForbiddenError,
  getDashboardData,
} from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — organization dashboard for the authenticated caller.
 *
 * Auth: 401 UNAUTHENTICATED without a valid Supabase session (httpOnly
 * cookies) or `Authorization: Bearer <access_token>` fallback. Identity
 * comes only from `auth.getUser()`; client-supplied userId /
 * organizationId / role claims are never read.
 *
 * Scope: the caller's earliest organization membership (created_at ASC,
 * mirroring provisioning's earliest-wins rule). `?organizationId=` (any
 * spelling) and all other query params are intentionally ignored, so a
 * foreign-org id can never switch context. RLS is the primary enforcement
 * (staff org-wide, developer member-project only); explicit
 * `organization_id` filters are defense-in-depth. No privileged
 * Drizzle/service-role access.
 *
 * Success: 200 `{ success: true, data: DashboardResponse["data"] }`.
 * Errors: canonical envelope only (no SQL/stack/secret details).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await getAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/dashboard auth failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Unable to load dashboard" },
      },
      { status: 500 },
    );
  }
  if ("response" in auth) {
    return auth.response;
  }
  const { user, supabase } = auth.context;

  // Query params are deliberately not parsed: the dashboard has no
  // filter/pagination surface and org scope never comes from the URL.
  void request.nextUrl;

  try {
    const data = await getDashboardData(supabase, user.id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    if (error instanceof DashboardForbiddenError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Insufficient permissions" },
        },
        { status: 403 },
      );
    }
    console.error("GET /api/dashboard failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Unable to load dashboard" },
      },
      { status: 500 },
    );
  }
}
