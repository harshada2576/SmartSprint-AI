/**
 * Shared backend API contract types.
 *
 * Ownership: Backend/API agent (`src/types/**`).
 *
 * These types define the authorization scope ("RequestScope") carried through
 * services into repositories, plus the single API error/success envelope used
 * by all user-facing endpoints.
 */

/** Exactly the three application roles. No new roles may be introduced. */
export type AppRole = "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER";

const APP_ROLES: ReadonlySet<string> = new Set([
  "ADMIN",
  "PROJECT_MANAGER",
  "DEVELOPER",
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
