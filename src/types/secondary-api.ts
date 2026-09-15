/**
 * Shared types for the secured secondary APIs
 * (backlog, AI recommendations, notifications).
 */

/** The only roles in the authority model (organization_members.role). */
export type SecondaryUserRole = "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER";

export const SECONDARY_USER_ROLES: readonly SecondaryUserRole[] = [
  "ADMIN",
  "PROJECT_MANAGER",
  "DEVELOPER",
] as const;

export function isSecondaryUserRole(
  value: unknown,
): value is SecondaryUserRole {
  return (
    value === "ADMIN" ||
    value === "PROJECT_MANAGER" ||
    value === "DEVELOPER"
  );
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationInfo;
}

export function buildPagination(
  page: number,
  pageSize: number,
  total: number,
): PaginationInfo {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
