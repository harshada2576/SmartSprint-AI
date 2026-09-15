import type { ApiErrorDetail } from "@/types/api";
import { isUuid } from "./query-params";

/**
 * Body validation for task mutations.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * Accepted fields mirror the `tasks` columns in `supabase/schema.ts` that
 * the UI surfaces (sprint board, execution, backlog): project, title,
 * description, priority, points, assignee, sprint, requirement, column
 * status (`column_status`), due date.
 *
 * Column status accepts `status`, `columnStatus`, and `column_status`
 * spellings (the board reads `column_status`; the list query maps `status`
 * onto it). All three spellings resolve to the same value.
 *
 * Never accepted:
 * - `displayId` / `display_id` (server-generated per project, immutable).
 * - `projectId` / `project_id` on PATCH (tasks never move projects;
 *   cross-org moves are additionally blocked by the
 *   `trg_tasks_forbid_cross_org_move` trigger).
 * - `organizationId` / `organization_id` (derived server-side from the
 *   task's project — never trusted from the client).
 * - `id`, timestamps, `userId`/`role` authority claims.
 *
 * No Zod in this repo: small typed parsers returning
 * `{ ok, value } | { ok, details }`. Routes map failures to 400
 * `VALIDATION_ERROR` with the shared envelope.
 */

export const TASK_COLUMN_STATUSES = [
  "backlog",
  "todo",
  "inProgress",
  "review",
  "testing",
  "done",
] as const;

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;
/** Task point magnitudes (mirrors requirement story-point bounds). */
const MAX_POINTS = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TaskCreateInput {
  projectId: string;
  title: string;
  description?: string | null;
  priority?: string;
  points?: number | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  requirementId?: string | null;
  columnStatus?: string;
  dueDate?: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  priority?: string;
  points?: number | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  requirementId?: string | null;
  columnStatus?: string;
  dueDate?: string | null;
  /**
   * Present when the body attempted a project move (service maps to 400 —
   * tasks never move projects; cross-org moves are additionally blocked by
   * the `trg_tasks_forbid_cross_org_move` trigger).
   */
  projectIdAttempt?: string;
  /** Present when the body attempted a display-ID rewrite (service → 400). */
  displayIdAttempt?: boolean;
  /** Present when the body attempted an org transfer (service maps to 403). */
  organizationIdAttempt?: string;
}

export type MutationParseSuccess<T> = { ok: true; value: T };
export type MutationParseFailure = { ok: false; details: ApiErrorDetail[] };
export type MutationParseResult<T> =
  | MutationParseSuccess<T>
  | MutationParseFailure;

function fail(field: string, message: string): ApiErrorDetail {
  return { field, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAlias(
  record: Record<string, unknown>,
  ...names: string[]
): unknown {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

function hasAlias(record: Record<string, unknown>, ...names: string[]): boolean {
  return names.some((name) =>
    Object.prototype.hasOwnProperty.call(record, name),
  );
}

function parseRequiredProjectId(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail("projectId", 'Field "projectId" is required'));
    return undefined;
  }
  if (!isUuid(raw.trim())) {
    details.push(fail("projectId", 'Field "projectId" must be a valid UUID'));
    return undefined;
  }
  return raw.trim();
}

function parseRequiredTitle(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail("title", 'Field "title" is required'));
    return undefined;
  }
  const title = raw.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    details.push(
      fail("title", `Field "title" must be at most ${MAX_TITLE_LENGTH} characters`),
    );
    return undefined;
  }
  return title;
}

function parseOptionalTitle(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined) return undefined;
  return parseRequiredTitle(raw, details);
}

function parseOptionalDescription(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    details.push(fail("description", 'Field "description" must be a string'));
    return undefined;
  }
  if (raw.trim() === "") return null;
  if (raw.trim().length > MAX_DESCRIPTION_LENGTH) {
    details.push(
      fail(
        "description",
        `Field "description" must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      ),
    );
    return undefined;
  }
  return raw.trim();
}

function parseOptionalEnum(
  raw: unknown,
  field: string,
  allowed: readonly string[],
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  if (!allowed.includes(raw.trim())) {
    details.push(
      fail(field, `Field "${field}" must be one of: ${allowed.join(", ")}`),
    );
    return undefined;
  }
  return raw.trim();
}

function parseOptionalPoints(
  raw: unknown,
  details: ApiErrorDetail[],
): number | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num)) {
    details.push(fail("points", 'Field "points" must be an integer'));
    return undefined;
  }
  if (num < 0 || num > MAX_POINTS) {
    details.push(
      fail("points", `Field "points" must be between 0 and ${MAX_POINTS}`),
    );
    return undefined;
  }
  return num;
}

function parseOptionalRef(
  raw: unknown,
  field: string,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (!isUuid(value)) {
    details.push(fail(field, `Field "${field}" must be a valid UUID`));
    return undefined;
  }
  return value;
}

function parseOptionalDate(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (!DATE_RE.test(value)) {
    details.push(fail("dueDate", 'Field "dueDate" must be YYYY-MM-DD'));
    return undefined;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) {
    details.push(fail("dueDate", 'Field "dueDate" must be a valid date'));
    return undefined;
  }
  return value;
}

function parseColumnStatus(
  record: Record<string, unknown>,
  details: ApiErrorDetail[],
): string | undefined {
  const raw = readAlias(record, "columnStatus", "column_status", "status");
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  if (!(TASK_COLUMN_STATUSES as readonly string[]).includes(raw.trim())) {
    details.push(
      fail(
        "status",
        `Field "status" must be one of: ${TASK_COLUMN_STATUSES.join(", ")}`,
      ),
    );
    return undefined;
  }
  return raw.trim();
}

/** POST /api/tasks body. */
export function parseTaskCreateBody(
  body: unknown,
): MutationParseResult<TaskCreateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as TaskCreateInput;

  const projectId = parseRequiredProjectId(
    readAlias(body, "projectId", "project_id"),
    details,
  );
  if (projectId !== undefined) value.projectId = projectId;

  const title = parseRequiredTitle(readAlias(body, "title"), details);
  if (title !== undefined) value.title = title;

  const description = parseOptionalDescription(
    readAlias(body, "description"),
    details,
  );
  if (description !== undefined) value.description = description;

  const priority = parseOptionalEnum(
    readAlias(body, "priority"),
    "priority",
    TASK_PRIORITIES,
    details,
  );
  if (priority !== undefined) value.priority = priority;

  const points = parseOptionalPoints(readAlias(body, "points"), details);
  if (points !== undefined) value.points = points;

  const assigneeId = parseOptionalRef(
    readAlias(body, "assigneeId", "assignee_id", "assignee"),
    "assigneeId",
    details,
  );
  if (assigneeId !== undefined) value.assigneeId = assigneeId;

  const sprintId = parseOptionalRef(
    readAlias(body, "sprintId", "sprint_id"),
    "sprintId",
    details,
  );
  if (sprintId !== undefined) value.sprintId = sprintId;

  const requirementId = parseOptionalRef(
    readAlias(body, "requirementId", "requirement_id"),
    "requirementId",
    details,
  );
  if (requirementId !== undefined) value.requirementId = requirementId;

  const columnStatus = parseColumnStatus(body, details);
  // Surface the canonical field name in details regardless of alias used.
  if (columnStatus !== undefined) value.columnStatus = columnStatus;

  const dueDate = parseOptionalDate(
    readAlias(body, "dueDate", "due_date"),
    details,
  );
  if (dueDate !== undefined) value.dueDate = dueDate;

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value };
}

const TASK_UPDATE_FIELDS = [
  "title",
  "description",
  "priority",
  "points",
  "assigneeId",
  "assignee_id",
  "assignee",
  "sprintId",
  "sprint_id",
  "requirementId",
  "requirement_id",
  "columnStatus",
  "column_status",
  "status",
  "dueDate",
  "due_date",
] as const;

/** PATCH /api/tasks/:id body — all fields optional, one required. */
export function parseTaskUpdateBody(
  body: unknown,
): MutationParseResult<TaskUpdateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as TaskUpdateInput;

  // Immutable linkage: project moves, display-ID rewrites, org transfers.
  if (hasAlias(body, "projectId", "project_id")) {
    const raw = readAlias(body, "projectId", "project_id");
    if (typeof raw === "string" && raw.trim() !== "" && isUuid(raw.trim())) {
      value.projectIdAttempt = raw.trim();
    } else {
      details.push(fail("projectId", 'Field "projectId" cannot be changed'));
    }
  }
  if (hasAlias(body, "displayId", "display_id")) {
    value.displayIdAttempt = true;
  }
  if (hasAlias(body, "organizationId", "organization_id")) {
    const raw = readAlias(body, "organizationId", "organization_id");
    if (typeof raw === "string" && raw.trim() !== "") {
      const attempt = raw.trim();
      if (!isUuid(attempt)) {
        details.push(
          fail("organizationId", 'Field "organizationId" must be a valid UUID'),
        );
      } else {
        value.organizationIdAttempt = attempt;
      }
    }
  }

  if (hasAlias(body, "title")) {
    const title = parseOptionalTitle(readAlias(body, "title"), details);
    if (title !== undefined) value.title = title;
  }
  if (hasAlias(body, "description")) {
    const description = parseOptionalDescription(
      readAlias(body, "description"),
      details,
    );
    if (description !== undefined) value.description = description;
  }
  if (hasAlias(body, "priority")) {
    const raw = readAlias(body, "priority");
    const priority = parseOptionalEnum(
      raw,
      "priority",
      TASK_PRIORITIES,
      details,
    );
    if (priority !== undefined) {
      value.priority = priority;
    } else if (
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "") &&
      !details.some((d) => d.field === "priority")
    ) {
      details.push(fail("priority", 'Field "priority" is invalid'));
    }
  }
  if (hasAlias(body, "points")) {
    const points = parseOptionalPoints(readAlias(body, "points"), details);
    if (points !== undefined) value.points = points;
  }
  if (hasAlias(body, "assigneeId", "assignee_id", "assignee")) {
    const assigneeId = parseOptionalRef(
      readAlias(body, "assigneeId", "assignee_id", "assignee"),
      "assigneeId",
      details,
    );
    if (assigneeId !== undefined) value.assigneeId = assigneeId;
  }
  if (hasAlias(body, "sprintId", "sprint_id")) {
    const sprintId = parseOptionalRef(
      readAlias(body, "sprintId", "sprint_id"),
      "sprintId",
      details,
    );
    if (sprintId !== undefined) value.sprintId = sprintId;
  }
  if (hasAlias(body, "requirementId", "requirement_id")) {
    const requirementId = parseOptionalRef(
      readAlias(body, "requirementId", "requirement_id"),
      "requirementId",
      details,
    );
    if (requirementId !== undefined) value.requirementId = requirementId;
  }
  if (hasAlias(body, "columnStatus", "column_status", "status")) {
    const raw = readAlias(body, "columnStatus", "column_status", "status");
    const parsed = parseOptionalEnum(
      raw,
      "status",
      TASK_COLUMN_STATUSES,
      details,
    );
    if (parsed !== undefined) {
      value.columnStatus = parsed;
    } else if (
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "") &&
      !details.some((d) => d.field === "status")
    ) {
      details.push(fail("status", 'Field "status" is invalid'));
    }
  }
  if (hasAlias(body, "dueDate", "due_date")) {
    const dueDate = parseOptionalDate(
      readAlias(body, "dueDate", "due_date"),
      details,
    );
    if (dueDate !== undefined) value.dueDate = dueDate;
  }

  if (details.length > 0) return { ok: false, details };

  const touched = TASK_UPDATE_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  // Immutability probes alone still parse so the service can answer with the
  // precise verdict (project/display moves → 400, org transfers → 403)
  // instead of a generic empty-body error.
  if (
    !touched &&
    value.projectIdAttempt === undefined &&
    value.displayIdAttempt === undefined &&
    value.organizationIdAttempt === undefined
  ) {
    return {
      ok: false,
      details: [
        fail("body", "Request body must include at least one editable field"),
      ],
    };
  }
  return { ok: true, value };
}
