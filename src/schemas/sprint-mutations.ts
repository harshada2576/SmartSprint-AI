import type { ApiErrorDetail } from "@/types/api";
import { isUuid } from "./query-params";

/**
 * Body validation for sprint mutations.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * Accepted fields mirror the `sprints` columns in `supabase/schema.ts` that
 * the UI surfaces (sprint board, planning, reports): project, name, goal,
 * status, start/end dates, total/completed points.
 *
 * Never accepted:
 * - `projectId` / `project_id` on PATCH (sprints never move projects;
 *   the `trg_sprints_forbid_cross_org_move` trigger backstops this).
 * - `organizationId` / `organization_id` (derived server-side from the
 *   sprint's project — never trusted from the client).
 * - `id`, timestamps.
 *
 * No Zod in this repo: small typed parsers returning
 * `{ ok, value } | { ok, details }`. Routes map failures to 400
 * `VALIDATION_ERROR` with the shared envelope.
 */

export const SPRINT_STATUSES = [
  "planning",
  "active",
  "completed",
  "cancelled",
] as const;

const MAX_NAME_LENGTH = 200;
const MAX_GOAL_LENGTH = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SprintCreateInput {
  projectId: string;
  name: string;
  goal?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  totalPoints?: number | null;
  completedPoints?: number | null;
}

export interface SprintUpdateInput {
  name?: string;
  goal?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  totalPoints?: number | null;
  completedPoints?: number | null;
  /**
   * Present when the body attempted a project move (service maps to 400 —
   * sprints never move projects; cross-org moves are additionally blocked
   * by the `trg_sprints_forbid_cross_org_move` trigger).
   */
  projectIdAttempt?: string;
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

function parseRequiredName(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail("name", 'Field "name" is required'));
    return undefined;
  }
  const name = raw.trim();
  if (name.length > MAX_NAME_LENGTH) {
    details.push(
      fail("name", `Field "name" must be at most ${MAX_NAME_LENGTH} characters`),
    );
    return undefined;
  }
  return name;
}

function parseOptionalGoal(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    details.push(fail("goal", 'Field "goal" must be a string'));
    return undefined;
  }
  if (raw.trim() === "") return null;
  if (raw.trim().length > MAX_GOAL_LENGTH) {
    details.push(
      fail(
        "goal",
        `Field "goal" must be at most ${MAX_GOAL_LENGTH} characters`,
      ),
    );
    return undefined;
  }
  return raw.trim();
}

function parseOptionalStatus(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (!(SPRINT_STATUSES as readonly string[]).includes(value)) {
    details.push(
      fail("status", `Field "status" must be one of: ${SPRINT_STATUSES.join(", ")}`),
    );
    return undefined;
  }
  return value;
}

function parseOptionalDate(
  raw: unknown,
  field: string,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();
  if (!DATE_RE.test(value)) {
    details.push(fail(field, `Field "${field}" must be YYYY-MM-DD`));
    return undefined;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) {
    details.push(fail(field, `Field "${field}" must be a valid date`));
    return undefined;
  }
  return value;
}

function parseOptionalPoints(
  raw: unknown,
  field: string,
  details: ApiErrorDetail[],
): number | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num)) {
    details.push(fail(field, `Field "${field}" must be an integer`));
    return undefined;
  }
  if (num < 0) {
    details.push(fail(field, `Field "${field}" must be greater than or equal to 0`));
    return undefined;
  }
  return num;
}

function checkDateOrder(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  details: ApiErrorDetail[],
): void {
  if (
    typeof startDate === "string" &&
    typeof endDate === "string" &&
    endDate < startDate
  ) {
    details.push(
      fail("endDate", 'Field "endDate" must be on or after "startDate"'),
    );
  }
}

/** POST /api/sprints body. */
export function parseSprintCreateBody(
  body: unknown,
): MutationParseResult<SprintCreateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as SprintCreateInput;

  const projectId = parseRequiredProjectId(
    readAlias(body, "projectId", "project_id"),
    details,
  );
  if (projectId !== undefined) value.projectId = projectId;

  const name = parseRequiredName(readAlias(body, "name"), details);
  if (name !== undefined) value.name = name;

  const goal = parseOptionalGoal(readAlias(body, "goal"), details);
  if (goal !== undefined) value.goal = goal;

  const status = parseOptionalStatus(readAlias(body, "status"), details);
  if (status !== undefined) value.status = status;

  const startDate = parseOptionalDate(
    readAlias(body, "startDate", "start_date"),
    "startDate",
    details,
  );
  if (startDate !== undefined) value.startDate = startDate;

  const endDate = parseOptionalDate(
    readAlias(body, "endDate", "end_date"),
    "endDate",
    details,
  );
  if (endDate !== undefined) value.endDate = endDate;

  const totalPoints = parseOptionalPoints(
    readAlias(body, "totalPoints", "total_points"),
    "totalPoints",
    details,
  );
  if (totalPoints !== undefined) value.totalPoints = totalPoints;

  const completedPoints = parseOptionalPoints(
    readAlias(body, "completedPoints", "completed_points"),
    "completedPoints",
    details,
  );
  if (completedPoints !== undefined) value.completedPoints = completedPoints;

  checkDateOrder(value.startDate, value.endDate, details);

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value };
}

const SPRINT_UPDATE_FIELDS = [
  "name",
  "goal",
  "status",
  "startDate",
  "start_date",
  "endDate",
  "end_date",
  "totalPoints",
  "total_points",
  "completedPoints",
  "completed_points",
] as const;

/** PATCH /api/sprints/:id body — all fields optional, one required. */
export function parseSprintUpdateBody(
  body: unknown,
): MutationParseResult<SprintUpdateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as SprintUpdateInput;

  // Immutable linkage: project moves and org transfers are rejected.
  if (hasAlias(body, "projectId", "project_id")) {
    const raw = readAlias(body, "projectId", "project_id");
    if (typeof raw === "string" && raw.trim() !== "" && isUuid(raw.trim())) {
      value.projectIdAttempt = raw.trim();
    } else {
      details.push(fail("projectId", 'Field "projectId" cannot be changed'));
    }
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

  if (hasAlias(body, "name")) {
    const raw = readAlias(body, "name");
    if (typeof raw !== "string" || raw.trim() === "") {
      details.push(fail("name", 'Field "name" must not be empty'));
    } else if (raw.trim().length > MAX_NAME_LENGTH) {
      details.push(
        fail(
          "name",
          `Field "name" must be at most ${MAX_NAME_LENGTH} characters`,
        ),
      );
    } else {
      value.name = raw.trim();
    }
  }
  if (hasAlias(body, "goal")) {
    const goal = parseOptionalGoal(readAlias(body, "goal"), details);
    if (goal !== undefined) value.goal = goal;
  }
  if (hasAlias(body, "status")) {
    const raw = readAlias(body, "status");
    const status = parseOptionalStatus(raw, details);
    if (status !== undefined) {
      value.status = status;
    } else if (
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "") &&
      !details.some((d) => d.field === "status")
    ) {
      details.push(fail("status", 'Field "status" is invalid'));
    }
  }
  if (hasAlias(body, "startDate", "start_date")) {
    const startDate = parseOptionalDate(
      readAlias(body, "startDate", "start_date"),
      "startDate",
      details,
    );
    if (startDate !== undefined) value.startDate = startDate;
  }
  if (hasAlias(body, "endDate", "end_date")) {
    const endDate = parseOptionalDate(
      readAlias(body, "endDate", "end_date"),
      "endDate",
      details,
    );
    if (endDate !== undefined) value.endDate = endDate;
  }
  if (hasAlias(body, "totalPoints", "total_points")) {
    const totalPoints = parseOptionalPoints(
      readAlias(body, "totalPoints", "total_points"),
      "totalPoints",
      details,
    );
    if (totalPoints !== undefined) value.totalPoints = totalPoints;
  }
  if (hasAlias(body, "completedPoints", "completed_points")) {
    const completedPoints = parseOptionalPoints(
      readAlias(body, "completedPoints", "completed_points"),
      "completedPoints",
      details,
    );
    if (completedPoints !== undefined) value.completedPoints = completedPoints;
  }

  checkDateOrder(value.startDate, value.endDate, details);

  if (details.length > 0) return { ok: false, details };

  const touched = SPRINT_UPDATE_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  // Immutability probes alone still parse so the service can answer with the
  // precise verdict (project moves → 400, org transfers → 403) instead of a
  // generic empty-body error.
  if (
    !touched &&
    value.projectIdAttempt === undefined &&
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
