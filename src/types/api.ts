/**
 * Shared backend API contract types.
 *
 * Ownership: Backend/API agent (`src/types/**`).
 *
 * These types define the authorization scope ("RequestScope") carried through
 * services into repositories, plus the single API error/success envelope used
 * by all user-facing endpoints.
 */

/** Exactly the six application roles. No other normal role is part of the MVP. */
export type AppRole =
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "DEVELOPER"
  | "FINANCE"
  | "LEGAL"
  | "HR";

const APP_ROLES: ReadonlySet<string> = new Set([
  "ADMIN",
  "PROJECT_MANAGER",
  "DEVELOPER",
  "FINANCE",
  "LEGAL",
  "HR",
]);

/** Runtime guard for role values read from the database. Fail-closed. */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.has(value);
}

/**
 * Server-derived authorization scope for one authenticated request.
 *
 * Built exclusively from the verified Supabase identity (`auth.getUser()`)
 * plus `organization_members` rows read through that same authenticated
 * context. Never populated from request bodies, query params, or any
 * browser-supplied role/organization claims.
 *
 * Role semantics (authoritative MVP model):
 * - ADMIN / PROJECT_MANAGER: organization-wide (staff).
 * - DEVELOPER / FINANCE / LEGAL: project-scoped via `project_members`.
 * - HR: organization-scoped, zero project-data access.
 */
export interface RequestScope {
  /** Verified `auth.uid()` of the caller. */
  userId: string;
  /** Organization ids where the caller holds any membership. */
  organizationIds: string[];
  /** Role per organization (a user may differ per org). */
  rolesByOrg: Record<string, AppRole>;
  /** True when the caller is ADMIN or PROJECT_MANAGER in at least one org. */
  isStaffAnywhere: boolean;
  /** Primary organization id (first active membership), if any. */
  primaryOrganizationId?: string;
  /** Highest/primary role of the user across memberships. */
  primaryRole?: AppRole;
}

/** Role priority for primary-role resolution (highest wins). */
export const ROLE_PRIORITY: Readonly<Record<AppRole, number>> = {
  ADMIN: 6,
  PROJECT_MANAGER: 5,
  FINANCE: 4,
  LEGAL: 3,
  DEVELOPER: 2,
  HR: 1,
};

/** Returns true for org-wide operational staff (ADMIN or PROJECT_MANAGER). */
export function isStaffRole(role: AppRole | undefined | string): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

/** Returns true when the role is project-scoped (DEV / FINANCE / LEGAL). */
export function isProjectScopedRole(
  role: AppRole | undefined | string,
): boolean {
  return role === "DEVELOPER" || role === "FINANCE" || role === "LEGAL";
}

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

/**
 * Paginated collection result returned by repositories for list endpoints.
 * `pagination` always carries the full `PaginationMeta` (page, pageSize,
 * total, totalPages) so every collection shares one response shape.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Mutation outcome shared by services and routes.
 *
 * Services return `{ ok: true, data }` or `{ ok: false, failure }` for every
 * expected case (permission denied, missing/invisible resource, invalid
 * references); routes map `failure.code` to the canonical error envelope via
 * `STATUS_BY_CODE` (`FORBIDDEN` → 403, `NOT_FOUND` → 404,
 * `VALIDATION_ERROR` → 400). Only unexpected database failures throw (routes
 * map those to generic 500 `INTERNAL_ERROR`, never SQL/details).
 */
export type MutationFailureCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR";

export interface MutationFailure {
  code: MutationFailureCode;
  message: string;
  details?: ApiErrorDetail[];
}

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: MutationFailure };
