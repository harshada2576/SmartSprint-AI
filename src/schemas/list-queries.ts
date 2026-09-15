import type { ApiErrorDetail } from "@/types/api";
import { parsePagination } from "@/utils/api-response";

/**
 * Query-parameter validation for the authenticated list endpoints.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * Notes:
 * - No Zod dependency exists in this repo, so validation is implemented as
 *   small typed parsers returning `{ ok, value } | { ok, details }`. The
 *   routes map failures to 400 `VALIDATION_ERROR` with the shared envelope.
 * - `camelCase` and `snake_case` spellings are both accepted for id filters
 *   (`projectId`/`project_id`, …). Any `organization_id`/`organizationId`
 *   parameter supplied by the browser is deliberately IGNORED (never trusted
 *   for scope switching); scope always comes from the server-side membership
 *   lookup. Unknown parameters are ignored.
 * - Enum sets mirror the Postgres enums in `supabase/schema.ts` exactly
 *   (case-sensitive).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export const PROJECT_STATUSES = [
  "active",
  "inactive",
  "pending",
  "completed",
  "blocked",
] as const;

export const REQUIREMENT_STATUSES = [
  "draft",
  "pending",
  "inProgress",
  "review",
  "testing",
  "completed",
  "blocked",
] as const;

export const REQUIREMENT_PRIORITIES = ["high", "medium", "low"] as const;

export const SPRINT_STATUSES = [
  "planning",
  "active",
  "completed",
  "cancelled",
] as const;

/** `status` query values for tasks map to `tasks.column_status`. */
export const TASK_STATUSES = [
  "backlog",
  "todo",
  "inProgress",
  "review",
  "testing",
  "done",
] as const;

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;

const MAX_SEARCH_LENGTH = 200;

export interface PagedQuery {
  page: number;
  pageSize: number;
}

export interface ProjectsQuery extends PagedQuery {
  status?: string;
  search?: string;
}

export interface RequirementsQuery extends PagedQuery {
  projectId?: string;
  sprintId?: string;
  status?: string;
  priority?: string;
  search?: string;
}

export interface SprintsQuery extends PagedQuery {
  projectId?: string;
  status?: string;
}

export interface TasksQuery extends PagedQuery {
  projectId?: string;
  sprintId?: string;
  status?: string;
  assigneeId?: string;
}

export type QueryParseSuccess<T> = { ok: true; value: T };
export type QueryParseFailure = { ok: false; details: ApiErrorDetail[] };
export type QueryParseResult<T> = QueryParseSuccess<T> | QueryParseFailure;

/** Blank/whitespace-only values are treated as absent. */
function optionalText(
  searchParams: URLSearchParams,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const raw = searchParams.get(name);
    if (raw !== null && raw.trim() !== "") {
      return raw.trim();
    }
  }
  return undefined;
}

function invalidEnumDetail(
  field: string,
  value: string,
  allowed: readonly string[],
): ApiErrorDetail {
  return {
    field,
    message: `${field} must be one of: ${allowed.join(", ")} (received "${value}")`,
  };
}

function invalidUuidDetail(field: string): ApiErrorDetail {
  return { field, message: `${field} must be a valid UUID` };
}

function parseSearch(
  searchParams: URLSearchParams,
  details: ApiErrorDetail[],
): string | undefined {
  const search = optionalText(searchParams, "search");
  if (search !== undefined && search.length > MAX_SEARCH_LENGTH) {
    details.push({
      field: "search",
      message: `search must be at most ${MAX_SEARCH_LENGTH} characters`,
    });
    return undefined;
  }
  return search;
}

function parseIdFilter(
  searchParams: URLSearchParams,
  field: string,
  details: ApiErrorDetail[],
  ...names: string[]
): string | undefined {
  const value = optionalText(searchParams, ...names);
  if (value === undefined) return undefined;
  if (!isUuid(value)) {
    details.push(invalidUuidDetail(field));
    return undefined;
  }
  return value;
}

function parseEnumFilter(
  searchParams: URLSearchParams,
  field: string,
  allowed: readonly string[],
  details: ApiErrorDetail[],
  ...names: string[]
): string | undefined {
  const value = optionalText(searchParams, ...names);
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    details.push(invalidEnumDetail(field, value, allowed));
    return undefined;
  }
  return value;
}

function withPagination<T>(
  searchParams: URLSearchParams,
  details: ApiErrorDetail[],
  build: (paged: PagedQuery) => T,
): QueryParseResult<T> {
  const pagination = parsePagination(searchParams);
  if (!pagination.ok) {
    details.push(...pagination.details);
  }
  if (details.length > 0) {
    return { ok: false, details };
  }
  // `pagination` is ok here because details would be non-empty otherwise.
  const paged = pagination.ok
    ? pagination.value
    : { page: 1, pageSize: 20 };
  return { ok: true, value: build(paged) };
}

/** GET /api/projects — `status`, `search`, `page`, `pageSize`. */
export function parseProjectsQuery(
  searchParams: URLSearchParams,
): QueryParseResult<ProjectsQuery> {
  const details: ApiErrorDetail[] = [];
  const status = parseEnumFilter(
    searchParams,
    "status",
    PROJECT_STATUSES,
    details,
    "status",
  );
  const search = parseSearch(searchParams, details);
  return withPagination(searchParams, details, (paged) => ({
    ...paged,
    ...(status !== undefined ? { status } : {}),
    ...(search !== undefined ? { search } : {}),
  }));
}

/**
 * GET /api/requirements — `projectId`, `sprintId`, `status`, `priority`,
 * `search`, pagination. `organization_id` (any spelling) is intentionally
 * not read.
 */
export function parseRequirementsQuery(
  searchParams: URLSearchParams,
): QueryParseResult<RequirementsQuery> {
  const details: ApiErrorDetail[] = [];
  const projectId = parseIdFilter(
    searchParams,
    "projectId",
    details,
    "projectId",
    "project_id",
  );
  const sprintId = parseIdFilter(
    searchParams,
    "sprintId",
    details,
    "sprintId",
    "sprint_id",
  );
  const status = parseEnumFilter(
    searchParams,
    "status",
    REQUIREMENT_STATUSES,
    details,
    "status",
  );
  const priority = parseEnumFilter(
    searchParams,
    "priority",
    REQUIREMENT_PRIORITIES,
    details,
    "priority",
  );
  const search = parseSearch(searchParams, details);
  return withPagination(searchParams, details, (paged) => ({
    ...paged,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(sprintId !== undefined ? { sprintId } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(search !== undefined ? { search } : {}),
  }));
}

/** GET /api/sprints — `projectId`, `status`, pagination. */
export function parseSprintsQuery(
  searchParams: URLSearchParams,
): QueryParseResult<SprintsQuery> {
  const details: ApiErrorDetail[] = [];
  const projectId = parseIdFilter(
    searchParams,
    "projectId",
    details,
    "projectId",
    "project_id",
  );
  const status = parseEnumFilter(
    searchParams,
    "status",
    SPRINT_STATUSES,
    details,
    "status",
  );
  return withPagination(searchParams, details, (paged) => ({
    ...paged,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(status !== undefined ? { status } : {}),
  }));
}

/**
 * GET /api/tasks — `projectId`, `sprintId`, `status` (→ `column_status`),
 * `assignee`/`assigneeId`, pagination.
 *
 * The `assignee` filter only narrows rows already permitted by RLS; it can
 * never broaden visibility, so developer reads stay boundary-safe.
 */
export function parseTasksQuery(
  searchParams: URLSearchParams,
): QueryParseResult<TasksQuery> {
  const details: ApiErrorDetail[] = [];
  const projectId = parseIdFilter(
    searchParams,
    "projectId",
    details,
    "projectId",
    "project_id",
  );
  const sprintId = parseIdFilter(
    searchParams,
    "sprintId",
    details,
    "sprintId",
    "sprint_id",
  );
  const status = parseEnumFilter(
    searchParams,
    "status",
    TASK_STATUSES,
    details,
    "status",
  );
  const assigneeId = parseIdFilter(
    searchParams,
    "assignee",
    details,
    "assignee",
    "assignee_id",
  );
  return withPagination(searchParams, details, (paged) => ({
    ...paged,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(sprintId !== undefined ? { sprintId } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(assigneeId !== undefined ? { assigneeId } : {}),
  }));
}
