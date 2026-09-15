import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAppRole, type RequestScope } from "@/types/api";
import { unauthenticatedResponse } from "./response";

/**
 * Authenticated request context for user-facing secondary APIs
 * (backlog, AI recommendations, notifications).
 *
 * Identity is derived server-side from the Supabase session (httpOnly
 * cookies) or, as a fallback for API clients, a verified
 * `Authorization: Bearer <access_token>` header. Client-supplied user IDs,
 * organization IDs, roles, and project membership claims are never read
 * and never trusted: every downstream query runs through this
 * RLS-enforcing client, so PostgreSQL Row Level Security resolves scope
 * from `auth.uid()` (the verified JWT subject).
 */
export interface AuthenticatedContext {
  user: User;
  supabase: SupabaseClient;
}

export type AuthResult =
  | { context: AuthenticatedContext }
  | { response: NextResponse };

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

async function contextFromBearerToken(
  token: string,
): Promise<AuthenticatedContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const verifier = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await verifier.auth.getUser(token);
  if (!data.user) {
    return null;
  }
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user: data.user, supabase };
}

/**
 * Resolves the authenticated caller or returns a 401 UNAUTHENTICATED
 * response in the shared error contract. Throws only on server
 * misconfiguration (missing Supabase env), which callers map to a
 * generic INTERNAL_ERROR — never to an auth bypass.
 */
export async function getAuthenticatedContext(
  request: NextRequest,
): Promise<AuthResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    return { context: { user: data.user, supabase } };
  }

  const token = getBearerToken(request);
  if (token) {
    const bearer = await contextFromBearerToken(token);
    if (bearer) {
      return { context: bearer };
    }
  }

  return { response: unauthenticatedResponse() };
}

export type RequireAuthResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; response: NextResponse };

/**
 * Compatibility wrapper for primary API routes
 * (`src/app/api/projects|requirements|sprints|tasks`): same verification as
 * `getAuthenticatedContext` but in the `{ ok, context }` discriminated
 * shape those routes consume. Throws only on server misconfiguration
 * (callers map that to a generic INTERNAL_ERROR).
 */
export async function requireAuthenticatedContext(
  request: NextRequest,
): Promise<RequireAuthResult> {
  const result = await getAuthenticatedContext(request);
  if ("response" in result) {
    return { ok: false, response: result.response };
  }
  return { ok: true, context: result.context };
}

interface OrganizationMembershipRow {
  organization_id: string;
  role: unknown;
}

/**
 * Resolves the server-derived authorization scope for primary API routes.
 * Reads `organization_members` through the caller's own RLS-enforcing
 * client (so only memberships visible to the caller are returned) and
 * validates every role against the exactly-three-role model
 * (ADMIN / PROJECT_MANAGER / DEVELOPER). Unknown role values are dropped
 * fail-closed. Never reads roles, org IDs, or membership from the request.
 */
export async function resolveRequestScope(
  supabase: SupabaseClient,
  userId: string,
): Promise<RequestScope> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId);
  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as OrganizationMembershipRow[];
  const organizationIds: string[] = [];
  const rolesByOrg: Record<string, RequestScope["rolesByOrg"][string]> = {};
  for (const row of rows) {
    if (
      typeof row.organization_id !== "string" ||
      !isAppRole(row.role) ||
      Object.prototype.hasOwnProperty.call(rolesByOrg, row.organization_id)
    ) {
      continue;
    }
    organizationIds.push(row.organization_id);
    rolesByOrg[row.organization_id] = row.role;
  }

  return {
    userId,
    organizationIds,
    rolesByOrg,
    isStaffAnywhere: Object.values(rolesByOrg).some(
      (role) => role === "ADMIN" || role === "PROJECT_MANAGER",
    ),
  };
}
