import type { NextResponse } from "next/server";
import { validationErrorResponse } from "@/api/response";
import type { ApiErrorDetail } from "@/types/api";
import { isUuid } from "./query-params";

/**
 * Body/query validation for commitment mutations.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * Accepted fields mirror the `commitments` columns created by
 * `supabase/migrations/0007_commitments.sql` (and reflected in
 * `supabase/schema.ts`): project, title, description, type, status,
 * due date, progress, owner.
 *
 * Never accepted:
 * - `id`, timestamps.
 * - `projectId` / `project_id` on update (commitments never move
 *   projects; the row is addressed by its own id).
 * - `organizationId` / `organization_id` (derived server-side from the
 *   commitment's project — never trusted from the client).
 *
 * No Zod in this repo: small typed parsers returning
 * `{ ok, value } | { ok, details }`. Routes map failures to 400
 * `VALIDATION_ERROR` with the shared envelope, so database CHECK
 * violations (type/status/progress enums, date shape) never surface
 * as 500s.
 */

export const COMMITMENT_TYPES = [
  "outcome",
  "deliverable",
  "milestone",
  "obligation",
] as const;

export type CommitmentType = (typeof COMMITMENT_TYPES)[number];

export const COMMITMENT_STATUSES = [
  "planned",
  "inProgress",
  "completed",
  "blocked",
] as const;

export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CommitmentCreateInput {
  project_id: string;
  title: string;
  description?: string | null;
  commitment_type?: CommitmentType;
  status?: CommitmentStatus;
  due_date?: string | null;
  progress?: number;
  owner_id?: string | null;
}

export interface CommitmentUpdateInput {
  title?: string;
  description?: string | null;
  commitment_type?: CommitmentType;
  status?: CommitmentStatus;
  due_date?: string | null;
  progress?: number;
  owner_id?: string | null;
  /**
   * Present when the body attempted a project move (service maps to 400 —
   * commitments never move projects).
   */
  projectIdAttempt?: string;
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
    details.push(fail("project_id", 'Field "project_id" is required'));
    return undefined;
  }
  if (!isUuid(raw.trim())) {
    details.push(
      fail("project_id", 'Field "project_id" must be a valid UUID'),
    );
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
      fail(
        "title",
        `Field "title" must be at most ${MAX_TITLE_LENGTH} characters`,
      ),
    );
    return undefined;
  }
  return title;
}

function parseOptionalTitle(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail("title", 'Field "title" must not be empty'));
    return undefined;
  }
  const title = raw.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    details.push(
      fail(
        "title",
        `Field "title" must be at most ${MAX_TITLE_LENGTH} characters`,
      ),
    );
    return undefined;
  }
  return title;
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

function parseOptionalCommitmentType(
  raw: unknown,
  details: ApiErrorDetail[],
): CommitmentType | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (!(COMMITMENT_TYPES as readonly string[]).includes(value)) {
    details.push(
      fail(
        "commitment_type",
        `Field "commitment_type" must be one of: ${COMMITMENT_TYPES.join(", ")}`,
      ),
    );
    return undefined;
  }
  return value as CommitmentType;
}

function parseOptionalStatus(
  raw: unknown,
  details: ApiErrorDetail[],
): CommitmentStatus | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (!(COMMITMENT_STATUSES as readonly string[]).includes(value)) {
    details.push(
      fail(
        "status",
        `Field "status" must be one of: ${COMMITMENT_STATUSES.join(", ")}`,
      ),
    );
    return undefined;
  }
  return value as CommitmentStatus;
}

function parseOptionalDueDate(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    details.push(fail("due_date", 'Field "due_date" must be YYYY-MM-DD'));
    return undefined;
  }
  if (raw.trim() === "") return null;
  const value = raw.trim();
  if (!DATE_RE.test(value)) {
    details.push(fail("due_date", 'Field "due_date" must be YYYY-MM-DD'));
    return undefined;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) {
    details.push(fail("due_date", 'Field "due_date" must be a valid date'));
    return undefined;
  }
  return value;
}

function parseOptionalProgress(
  raw: unknown,
  details: ApiErrorDetail[],
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num)) {
    details.push(fail("progress", 'Field "progress" must be an integer'));
    return undefined;
  }
  if (num < 0 || num > 100) {
    details.push(
      fail("progress", 'Field "progress" must be between 0 and 100'),
    );
    return undefined;
  }
  return num;
}

function parseOptionalOwnerId(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    details.push(
      fail("owner_id", 'Field "owner_id" must be a valid UUID'),
    );
    return undefined;
  }
  if (raw.trim() === "") return null;
  if (!isUuid(raw.trim())) {
    details.push(
      fail("owner_id", 'Field "owner_id" must be a valid UUID'),
    );
    return undefined;
  }
  return raw.trim();
}

/** POST /api/commitments body. */
export function parseCommitmentCreateBody(
  body: unknown,
): MutationParseResult<CommitmentCreateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as CommitmentCreateInput;

  const projectId = parseRequiredProjectId(
    readAlias(body, "project_id", "projectId"),
    details,
  );
  if (projectId !== undefined) value.project_id = projectId;

  const title = parseRequiredTitle(readAlias(body, "title"), details);
  if (title !== undefined) value.title = title;

  const description = parseOptionalDescription(
    readAlias(body, "description"),
    details,
  );
  if (description !== undefined) value.description = description;

  const commitmentType = parseOptionalCommitmentType(
    readAlias(body, "commitment_type", "commitmentType"),
    details,
  );
  if (commitmentType !== undefined) value.commitment_type = commitmentType;

  const status = parseOptionalStatus(readAlias(body, "status"), details);
  if (status !== undefined) value.status = status;

  const dueDate = parseOptionalDueDate(
    readAlias(body, "due_date", "dueDate"),
    details,
  );
  if (dueDate !== undefined) value.due_date = dueDate;

  const progress = parseOptionalProgress(
    readAlias(body, "progress"),
    details,
  );
  if (progress !== undefined) value.progress = progress;

  const ownerId = parseOptionalOwnerId(
    readAlias(body, "owner_id", "ownerId"),
    details,
  );
  if (ownerId !== undefined) value.owner_id = ownerId;

  if (details.length > 0) {
    return { ok: false, details };
  }
  return { ok: true, value };
}

/** PUT /api/commitments/[id] body. */
export function parseCommitmentUpdateBody(
  body: unknown,
): MutationParseResult<CommitmentUpdateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as CommitmentUpdateInput;

  // Commitments never move projects: record the attempt so the service
  // can reject it instead of silently ignoring it.
  if (hasAlias(body, "project_id", "projectId")) {
    const raw = readAlias(body, "project_id", "projectId");
    if (typeof raw === "string" && raw.trim() !== "") {
      value.projectIdAttempt = raw.trim();
    }
  }

  const title = parseOptionalTitle(readAlias(body, "title"), details);
  if (title !== undefined) value.title = title;

  if (hasAlias(body, "description") && body.description === null) {
    value.description = null;
  } else {
    const description = parseOptionalDescription(
      readAlias(body, "description"),
      details,
    );
    if (description !== undefined) value.description = description;
  }

  const commitmentType = parseOptionalCommitmentType(
    readAlias(body, "commitment_type", "commitmentType"),
    details,
  );
  if (commitmentType !== undefined) value.commitment_type = commitmentType;

  const status = parseOptionalStatus(readAlias(body, "status"), details);
  if (status !== undefined) value.status = status;

  if (
    hasAlias(body, "due_date", "dueDate") &&
    readAlias(body, "due_date", "dueDate") === null
  ) {
    value.due_date = null;
  } else {
    const dueDate = parseOptionalDueDate(
      readAlias(body, "due_date", "dueDate"),
      details,
    );
    if (dueDate !== undefined) value.due_date = dueDate;
  }

  const progress = parseOptionalProgress(
    readAlias(body, "progress"),
    details,
  );
  if (progress !== undefined) value.progress = progress;

  if (
    hasAlias(body, "owner_id", "ownerId") &&
    readAlias(body, "owner_id", "ownerId") === null
  ) {
    value.owner_id = null;
  } else {
    const ownerId = parseOptionalOwnerId(
      readAlias(body, "owner_id", "ownerId"),
      details,
    );
    if (ownerId !== undefined) value.owner_id = ownerId;
  }

  if (details.length > 0) {
    return { ok: false, details };
  }
  return { ok: true, value };
}

export type CommitmentQueryResult =
  | { projectId: string }
  | { response: NextResponse };

/**
 * Validates GET /api/commitments query parameters.
 *
 * `projectId` is required and must be a UUID. Project visibility itself
 * is enforced by the route (explicit accessibility probe) and by RLS.
 */
export function validateCommitmentsQuery(
  searchParams: URLSearchParams,
): CommitmentQueryResult {
  const raw =
    searchParams.get("projectId") ?? searchParams.get("project_id");

  if (raw === null || raw.trim() === "") {
    return {
      response: validationErrorResponse([
        { field: "projectId", message: "projectId is required" },
      ]),
    };
  }

  if (!isUuid(raw.trim())) {
    return {
      response: validationErrorResponse([
        {
          field: "projectId",
          message: 'Query parameter "projectId" must be a valid UUID',
        },
      ]),
    };
  }

  return { projectId: raw.trim() };
}
