import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedContext } from "@/api/auth";
import { isAppRole, type AppRole } from "@/types/api";
import {
  internalErrorResponse,
  successResponse,
} from "@/api/response";

/**
 * GET /api/me — authenticated caller's profile + organization context.
 *
 * Auth: 401 UNAUTHENTICATED without a valid Supabase session (httpOnly
 * cookies) or `Authorization: Bearer <access_token>` fallback. Identity
 * comes only from `auth.getUser()`; no user/org/role claims are read from
 * the request.
 *
 * Scope: derived server-side from `organization_members` rows visible to
 * the caller through RLS (the caller's own memberships). The primary
 * organization is the earliest membership (created_at ASC, org id
 * tie-break), mirroring the provisioning lane's earliest-wins rule and
 * the dashboard scope. There is intentionally no client-selectable
 * organization switcher: a foreign-org id can never be supplied.
 *
 * Reads only (no writes, no provisioning). Provisioning stays in the
 * trusted server lane (`POST /auth/provision`, `GET /auth/callback`).
 * No privileged Drizzle/service-role access; the caller's RLS-enforcing
 * client is the primary enforcement.
 *
 * Success: 200 `{ success: true, data: MeResponse }` where
 * `primaryOrganization` is null when the caller has no membership yet
 * (e.g. provisioning pending) — the UI treats that as "no organization",
 * never as another user's organization.
 */

interface MeMembership {
  organizationId: string;
  role: AppRole;
  createdAt: string | null;
}

interface MeOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    avatarInitials: string | null;
    avatarUrl: string | null;
  };
  memberships: MeMembership[];
  organizations: MeOrganization[];
  primaryOrganization: (MeOrganization & {
    role: MeMembership["role"];
  }) | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMembership(value: unknown): MeMembership | null {
  if (!isRecord(value)) return null;
  if (typeof value.organization_id !== "string") return null;
  if (!isAppRole(value.role)) return null;
  return {
    organizationId: value.organization_id,
    role: value.role,
    createdAt:
      typeof value.created_at === "string" ? value.created_at : null,
  };
}

function toOrganization(value: unknown): MeOrganization | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.name !== "string") return null;
  if (typeof value.slug !== "string") return null;
  return { id: value.id, name: value.name, slug: value.slug };
}

async function fetchMyMemberships(
  client: SupabaseClient,
  userId: string,
): Promise<MeMembership[]> {
  const { data, error } = await client
    .from("organization_members")
    .select("organization_id,role,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("organization_id", { ascending: true })
    .limit(100);
  if (error) throw error;
  const out: MeMembership[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toMembership(item);
      if (row) out.push(row);
    }
  }
  return out;
}

async function fetchMyProfile(
  client: SupabaseClient,
  userId: string,
): Promise<{
  firstName: string;
  lastName: string;
  avatarInitials: string | null;
  avatarUrl: string | null;
} | null> {
  const { data, error } = await client
    .from("users")
    .select("first_name,last_name,avatar_initials,avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!isRecord(data)) return null;
  return {
    firstName: typeof data.first_name === "string" ? data.first_name : "",
    lastName: typeof data.last_name === "string" ? data.last_name : "",
    avatarInitials:
      typeof data.avatar_initials === "string"
        ? data.avatar_initials
        : null,
    avatarUrl:
      typeof data.avatar_url === "string" ? data.avatar_url : null,
  };
}

async function fetchOrganizationsByIds(
  client: SupabaseClient,
  organizationIds: string[],
): Promise<MeOrganization[]> {
  const unique = [...new Set(organizationIds)].slice(0, 100);
  if (unique.length === 0) return [];
  const { data, error } = await client
    .from("organizations")
    .select("id,name,slug")
    .in("id", unique)
    .limit(100);
  if (error) throw error;
  const out: MeOrganization[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = toOrganization(item);
      if (row) out.push(row);
    }
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await getAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/me auth failed:", error);
    return internalErrorResponse();
  }
  if ("response" in auth) {
    return auth.response;
  }
  const { user, supabase } = auth.context;

  try {
    const [profile, memberships] = await Promise.all([
      fetchMyProfile(supabase, user.id),
      fetchMyMemberships(supabase, user.id),
    ]);

    const organizations = await fetchOrganizationsByIds(
      supabase,
      memberships.map((m) => m.organizationId),
    );
    const orgById = new Map(organizations.map((o) => [o.id, o]));

    // Earliest membership wins (already ordered); only organizations
    // visible to the caller under RLS are eligible.
    let primaryOrganization: MeResponse["primaryOrganization"] = null;
    for (const membership of memberships) {
      const org = orgById.get(membership.organizationId);
      if (org) {
        primaryOrganization = { ...org, role: membership.role };
        break;
      }
    }

    const firstName = profile?.firstName ?? "";
    const lastName = profile?.lastName ?? "";
    const displayName =
      `${firstName} ${lastName}`.trim().replace(/\s+/g, " ") ||
      user.email?.split("@")[0] ||
      "User";

    const data: MeResponse = {
      user: {
        id: user.id,
        email: user.email ?? "",
        firstName,
        lastName,
        displayName,
        avatarInitials: profile?.avatarInitials ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
      memberships,
      organizations,
      primaryOrganization,
    };
    return successResponse(data);
  } catch (error) {
    console.error("GET /api/me failed:", error);
    return internalErrorResponse();
  }
}
