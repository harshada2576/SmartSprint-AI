import type { ApiErrorDetail } from "@/types/api";
import { isUuid } from "./query-params";

/**
 * Body validation for requirement mutations.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * Accepted fields mirror the `requirements` columns in
 * `supabase/schema.ts` that the UI surfaces (requirements table, backlog,
 * validation queue): project, title, description, category, business value,
 * customer importance, urgency, complexity, estimated effort, risk,
 * story points, dependency, priority, status, assignee, sprint.
 *
 * Never accepted:
 * - `displayId` / `display_id` (server-generated per project, immutable).
 * - `projectId` / `project_id` on PATCH (requirements never move projects).
 * - `organizationId` / `organization_id` (derived server-side from the
 *   requirement's project — never trusted from the client).
 * - `id`, timestamps.
 *
 * No Zod in this repo: small typed parsers returning
 * `{ ok, value } | { ok, details }`. Routes map failures to 400
 * `VALIDATION_ERROR` with the shared envelope.
 */

export const REQUIREMENT_CATEGORIES = [
  "feature",
  "bug",
  "enhancement",
  "security",
  "uiux",
  "performance",
  "database",
  "api",
  "documentation",
] as const;

export const REQUIREMENT_BUSINESS_VALUES = ["high", "medium", "low"] as const;

export const REQUIREMENT_PRIORITIES = ["high", "medium", "low"] as const;

export const REQUIREMENT_STATUSES = [
  "draft",
  "pending",
  "inProgress",
  "review",
  "testing",
  "completed",
  "blocked",
] as const;

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;
/** AI-scoring fields are 0–100 scale values. */
const MAX_SCORE_100 = 100;
/** Effort / story-point magnitudes. */
const MAX_MAGNITUDE_1000 = 1000;

export interface RequirementCreateInput {
  projectId: string;
  title: string;
  category: string;
  description?: string | null;
  businessValue?: string;
  customerImportance?: number | null;
  urgency?: number | null;
  complexity?: number | null;
  estimatedEffort?: number | null;
  risk?: number | null;
  storyPoints?: number | null;
  dependencyId?: string | null;
  priority?: string;
  status?: string;
  assigneeId?: string | null;
  sprintId?: string | null;
}

export interface RequirementUpdateInput {
  title?: string;
  category?: string;
  description?: string | null;
  businessValue?: string;
  customerImportance?: number | null;
  urgency?: number | null;
  complexity?: number | null;
  estimatedEffort?: number | null;
  risk?: number | null;
  storyPoints?: number | null;
  dependencyId?: string | null;
  priority?: string;
  status?: string;
  assigneeId?: string | null;
  sprintId?: string | null;
  /**
   * Present when the body attempted a project move (service maps to 400 —
   * requirements never move projects; cross-org moves are additionally
   * blocked by the `trg_requirements_forbid_cross_org_move` trigger).
   */
  projectIdAttempt?: string;
  /** Present when the body attempted a display-ID rewrite (service → 400). */
  displayIdAttempt?: boolean;
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

function parseRequiredEnum(
  raw: unknown,
  field: string,
  allowed: readonly string[],
  details: ApiErrorDetail[],
): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail(field, `Field "${field}" is required`));
    return undefined;
  }
  if (!allowed.includes(raw)) {
    details.push(
      fail(field, `Field "${field}" must be one of: ${allowed.join(", ")}`),
    );
    return undefined;
  }
  return raw;
}

function parseOptionalEnum(
  raw: unknown,
  field: string,
  allowed: readonly string[],
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  if (!allowed.includes(raw)) {
    details.push(
      fail(field, `Field "${field}" must be one of: ${allowed.join(", ")}`),
    );
    return undefined;
  }
  return raw;
}

function parseOptionalScore(
  raw: unknown,
  field: string,
  max: number,
  details: ApiErrorDetail[],
): number | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num)) {
    details.push(fail(field, `Field "${field}" must be an integer`));
    return undefined;
  }
  if (num < 0 || num > max) {
    details.push(fail(field, `Field "${field}" must be between 0 and ${max}`));
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

/** POST /api/requirements body. */
export function parseRequirementCreateBody(
  body: unknown,
): MutationParseResult<RequirementCreateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as RequirementCreateInput;

  const projectId = parseRequiredProjectId(
    readAlias(body, "projectId", "project_id"),
    details,
  );
  if (projectId !== undefined) value.projectId = projectId;

  const title = parseRequiredTitle(readAlias(body, "title"), details);
  if (title !== undefined) value.title = title;

  const category = parseRequiredEnum(
    readAlias(body, "category"),
    "category",
    REQUIREMENT_CATEGORIES,
    details,
  );
  if (category !== undefined) value.category = category;

  const description = parseOptionalDescription(
    readAlias(body, "description"),
    details,
  );
  if (description !== undefined) value.description = description;

  const businessValue = parseOptionalEnum(
    readAlias(body, "businessValue", "business_value"),
    "businessValue",
    REQUIREMENT_BUSINESS_VALUES,
    details,
  );
  if (businessValue !== undefined) value.businessValue = businessValue;

  const customerImportance = parseOptionalScore(
    readAlias(body, "customerImportance", "customer_importance"),
    "customerImportance",
    MAX_SCORE_100,
    details,
  );
  if (customerImportance !== undefined)
    value.customerImportance = customerImportance;

  const urgency = parseOptionalScore(
    readAlias(body, "urgency"),
    "urgency",
    MAX_SCORE_100,
    details,
  );
  if (urgency !== undefined) value.urgency = urgency;

  const complexity = parseOptionalScore(
    readAlias(body, "complexity"),
    "complexity",
    MAX_SCORE_100,
    details,
  );
  if (complexity !== undefined) value.complexity = complexity;

  const estimatedEffort = parseOptionalScore(
    readAlias(body, "estimatedEffort", "estimated_effort"),
    "estimatedEffort",
    MAX_MAGNITUDE_1000,
    details,
  );
  if (estimatedEffort !== undefined) value.estimatedEffort = estimatedEffort;

  const risk = parseOptionalScore(readAlias(body, "risk"), "risk", MAX_SCORE_100, details);
  if (risk !== undefined) value.risk = risk;

  const storyPoints = parseOptionalScore(
    readAlias(body, "storyPoints", "story_points"),
    "storyPoints",
    MAX_MAGNITUDE_1000,
    details,
  );
  if (storyPoints !== undefined) value.storyPoints = storyPoints;

  const dependencyId = parseOptionalRef(
    readAlias(body, "dependencyId", "dependency_id"),
    "dependencyId",
    details,
  );
  if (dependencyId !== undefined) value.dependencyId = dependencyId;

  const priority = parseOptionalEnum(
    readAlias(body, "priority"),
    "priority",
    REQUIREMENT_PRIORITIES,
    details,
  );
  if (priority !== undefined) value.priority = priority;

  const status = parseOptionalEnum(
    readAlias(body, "status"),
    "status",
    REQUIREMENT_STATUSES,
    details,
  );
  if (status !== undefined) value.status = status;

  const assigneeId = parseOptionalRef(
    readAlias(body, "assigneeId", "assignee_id"),
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

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value };
}

const REQUIREMENT_UPDATE_FIELDS = [
  "title",
  "description",
  "category",
  "businessValue",
  "business_value",
  "customerImportance",
  "customer_importance",
  "urgency",
  "complexity",
  "estimatedEffort",
  "estimated_effort",
  "risk",
  "storyPoints",
  "story_points",
  "dependencyId",
  "dependency_id",
  "priority",
  "status",
  "assigneeId",
  "assignee_id",
  "sprintId",
  "sprint_id",
] as const;

/** PATCH /api/requirements/:id body — all fields optional, one required. */
export function parseRequirementUpdateBody(
  body: unknown,
): MutationParseResult<RequirementUpdateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as RequirementUpdateInput;

  // Immutable linkage: project moves and display-ID rewrites are rejected.
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
  if (hasAlias(body, "category")) {
    const raw = readAlias(body, "category");
    if (typeof raw === "string" && raw.trim() === "") {
      details.push(fail("category", 'Field "category" must not be empty'));
    } else {
      const category = parseOptionalEnum(
        raw,
        "category",
        REQUIREMENT_CATEGORIES,
        details,
      );
      if (category !== undefined) value.category = category;
      else if (raw !== undefined && raw !== null && !details.some((d) => d.field === "category")) {
        details.push(fail("category", 'Field "category" is invalid'));
      }
    }
  }
  if (hasAlias(body, "businessValue", "business_value")) {
    const businessValue = parseOptionalEnum(
      readAlias(body, "businessValue", "business_value"),
      "businessValue",
      REQUIREMENT_BUSINESS_VALUES,
      details,
    );
    if (businessValue !== undefined) value.businessValue = businessValue;
    else {
      const raw = readAlias(body, "businessValue", "business_value");
      if (
        raw !== undefined &&
        raw !== null &&
        !(typeof raw === "string" && raw.trim() === "") &&
        !details.some((d) => d.field === "businessValue")
      ) {
        details.push(fail("businessValue", 'Field "businessValue" is invalid'));
      }
    }
  }
  if (hasAlias(body, "customerImportance", "customer_importance")) {
    const customerImportance = parseOptionalScore(
      readAlias(body, "customerImportance", "customer_importance"),
      "customerImportance",
      MAX_SCORE_100,
      details,
    );
    if (customerImportance !== undefined)
      value.customerImportance = customerImportance;
  }
  if (hasAlias(body, "urgency")) {
    const urgency = parseOptionalScore(
      readAlias(body, "urgency"),
      "urgency",
      MAX_SCORE_100,
      details,
    );
    if (urgency !== undefined) value.urgency = urgency;
  }
  if (hasAlias(body, "complexity")) {
    const complexity = parseOptionalScore(
      readAlias(body, "complexity"),
      "complexity",
      MAX_SCORE_100,
      details,
    );
    if (complexity !== undefined) value.complexity = complexity;
  }
  if (hasAlias(body, "estimatedEffort", "estimated_effort")) {
    const estimatedEffort = parseOptionalScore(
      readAlias(body, "estimatedEffort", "estimated_effort"),
      "estimatedEffort",
      MAX_MAGNITUDE_1000,
      details,
    );
    if (estimatedEffort !== undefined) value.estimatedEffort = estimatedEffort;
  }
  if (hasAlias(body, "risk")) {
    const risk = parseOptionalScore(
      readAlias(body, "risk"),
      "risk",
      MAX_SCORE_100,
      details,
    );
    if (risk !== undefined) value.risk = risk;
  }
  if (hasAlias(body, "storyPoints", "story_points")) {
    const storyPoints = parseOptionalScore(
      readAlias(body, "storyPoints", "story_points"),
      "storyPoints",
      MAX_MAGNITUDE_1000,
      details,
    );
    if (storyPoints !== undefined) value.storyPoints = storyPoints;
  }
  if (hasAlias(body, "dependencyId", "dependency_id")) {
    const dependencyId = parseOptionalRef(
      readAlias(body, "dependencyId", "dependency_id"),
      "dependencyId",
      details,
    );
    if (dependencyId !== undefined) value.dependencyId = dependencyId;
  }
  if (hasAlias(body, "priority")) {
    const raw = readAlias(body, "priority");
    const priority = parseOptionalEnum(
      raw,
      "priority",
      REQUIREMENT_PRIORITIES,
      details,
    );
    if (priority !== undefined) value.priority = priority;
    else if (
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "") &&
      !details.some((d) => d.field === "priority")
    ) {
      details.push(fail("priority", 'Field "priority" is invalid'));
    }
  }
  if (hasAlias(body, "status")) {
    const raw = readAlias(body, "status");
    const status = parseOptionalEnum(
      raw,
      "status",
      REQUIREMENT_STATUSES,
      details,
    );
    if (status !== undefined) value.status = status;
    else if (
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "") &&
      !details.some((d) => d.field === "status")
    ) {
      details.push(fail("status", 'Field "status" is invalid'));
    }
  }
  if (hasAlias(body, "assigneeId", "assignee_id")) {
    const assigneeId = parseOptionalRef(
      readAlias(body, "assigneeId", "assignee_id"),
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

  if (details.length > 0) return { ok: false, details };

  const touched = REQUIREMENT_UPDATE_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  if (!touched) {
    return {
      ok: false,
      details: [
        fail("body", "Request body must include at least one editable field"),
      ],
    };
  }
  return { ok: true, value };
}
