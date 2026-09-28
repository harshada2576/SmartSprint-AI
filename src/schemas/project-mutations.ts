import type { ApiErrorDetail } from "@/types/api";
import { isUuid } from "./query-params";

/**
 * Mutation validation for projects.
 *
 * Ownership: Backend/API agent (`src/schemas/**`).
 *
 * No Zod in this repo: small typed parsers returning
 * `{ ok, value } | { ok, details }`. Routes map failures to 400
 * `VALIDATION_ERROR` with the shared envelope.
 *
 * Field policy (mirrors `supabase/schema.ts` + `src/app/projects/create`):
 * - Accepted: name, code, description, client, managerId, method, status,
 *   priority, progress, startDate, endDate, budgetTotal, budgetCurrency.
 * - `organizationId`/`organization_id` is parsed ONLY as a selection hint
 *   inside the caller's own memberships. Authority always comes from
 *   `organization_members` via `RequestScope`; a hint outside the caller's
 *   staff orgs is rejected downstream with 403 (never trusted).
 * - `userId`/`role`/`id`/timestamps/membership arrays are never read.
 * - `code` is optional: when absent/blank the service auto-generates a
 *   per-org unique code. When present it is uppercased and must match
 *   `^[A-Za-z0-9][A-Za-z0-9-_]*$` (2–20 chars). `UNIQUE(organization_id,
 *   code)` is enforced by the database; collisions map to 400.
 */

export const PROJECT_METHODS = [
  "scrum",
  "kanban",
  "waterfall",
  "hybrid",
  "incremental",
  "prototyping",
  "spiral",
  "agile",
  "xp",
] as const;

export const PROJECT_STATUSES = [
  "active",
  "inactive",
  "pending",
  "completed",
  "blocked",
] as const;

export const PROJECT_PRIORITIES = ["high", "medium", "low"] as const;

export const PROJECT_CURRENCIES_RE = /^[A-Z]{3}$/;
const PROJECT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ProjectCreateInput {
  name: string;
  code?: string;
  description?: string | null;
  client?: string | null;
  managerId?: string | null;
  method?: string;
  status?: string;
  priority?: string;
  progress?: number;
  startDate?: string | null;
  endDate?: string | null;
  budgetTotal?: string | null;
  budgetCurrency?: string;
  /** Selection hint only — never authority. */
  organizationIdHint?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  code?: string;
  description?: string | null;
  client?: string | null;
  managerId?: string | null;
  method?: string;
  status?: string;
  priority?: string;
  progress?: number;
  startDate?: string | null;
  endDate?: string | null;
  budgetTotal?: string | null;
  budgetCurrency?: string;
  /** Present when the body attempted an org move (service maps to 403). */
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

function parseOptionalText(
  raw: unknown,
  field: string,
  maxLength: number,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    details.push(fail(field, `Field "${field}" must be a string`));
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) {
    details.push(
      fail(field, `Field "${field}" must be at most ${maxLength} characters`),
    );
    return undefined;
  }
  return trimmed;
}

function parseRequiredText(
  raw: unknown,
  field: string,
  maxLength: number,
  details: ApiErrorDetail[],
): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    details.push(fail(field, `Field "${field}" is required`));
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    details.push(
      fail(field, `Field "${field}" must be at most ${maxLength} characters`),
    );
    return undefined;
  }
  return trimmed;
}

function parseOptionalEnum(
  raw: unknown,
  field: string,
  allowed: readonly string[],
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (!allowed.includes(value)) {
    details.push(
      fail(
        field,
        `Field "${field}" must be one of: ${allowed.join(", ")} (received "${value}")`,
      ),
    );
    return undefined;
  }
  return value;
}

function parseOptionalUuid(
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

function parseOptionalProgress(
  raw: unknown,
  details: ApiErrorDetail[],
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    details.push(fail("progress", 'Field "progress" must be an integer 0-100'));
    return undefined;
  }
  if (raw < 0 || raw > 100) {
    details.push(fail("progress", 'Field "progress" must be between 0 and 100'));
    return undefined;
  }
  return raw;
}

function parseOptionalBudget(
  raw: unknown,
  details: ApiErrorDetail[],
): string | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num)) {
    details.push(fail("budgetTotal", 'Field "budgetTotal" must be a number'));
    return undefined;
  }
  if (num < 0 || num > 9999999999.99) {
    details.push(
      fail("budgetTotal", 'Field "budgetTotal" must be between 0 and 9999999999.99'),
    );
    return undefined;
  }
  const rounded = Math.round(num * 100) / 100;
  return rounded.toFixed(2);
}

function parseCode(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const upper = raw.trim().toUpperCase();
  if (upper.length < 2 || upper.length > 20) {
    details.push(fail("code", 'Field "code" must be 2-20 characters'));
    return undefined;
  }
  if (!PROJECT_CODE_RE.test(upper)) {
    details.push(
      fail(
        "code",
        'Field "code" must start alphanumeric and contain only letters, digits, "-" and "_"',
      ),
    );
    return undefined;
  }
  return upper;
}

function parseCurrency(
  raw: unknown,
  details: ApiErrorDetail[],
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const upper = raw.trim().toUpperCase();
  if (!PROJECT_CURRENCIES_RE.test(upper)) {
    details.push(
      fail("budgetCurrency", 'Field "budgetCurrency" must be a 3-letter code (e.g. USD)'),
    );
    return undefined;
  }
  return upper;
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

/** POST /api/projects body. */
export function parseProjectCreateBody(
  body: unknown,
): MutationParseResult<ProjectCreateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as ProjectCreateInput;

  const name = parseRequiredText(readAlias(body, "name"), "name", 200, details);
  if (name !== undefined) value.name = name;

  const code = parseCode(readAlias(body, "code"), details);
  if (code !== undefined) value.code = code;

  const description = parseOptionalText(
    readAlias(body, "description"),
    "description",
    5000,
    details,
  );
  if (description !== undefined) value.description = description;

  const client = parseOptionalText(
    readAlias(body, "client"),
    "client",
    200,
    details,
  );
  if (client !== undefined) value.client = client;

  const managerId = parseOptionalUuid(
    readAlias(body, "managerId", "manager_id"),
    "managerId",
    details,
  );
  if (managerId !== undefined) value.managerId = managerId;

  const method = parseOptionalEnum(
    readAlias(body, "method"),
    "method",
    PROJECT_METHODS,
    details,
  );
  if (method !== undefined) value.method = method;

  const status = parseOptionalEnum(
    readAlias(body, "status"),
    "status",
    PROJECT_STATUSES,
    details,
  );
  if (status !== undefined) value.status = status;

  const priority = parseOptionalEnum(
    readAlias(body, "priority"),
    "priority",
    PROJECT_PRIORITIES,
    details,
  );
  if (priority !== undefined) value.priority = priority;

  const progress = parseOptionalProgress(
    readAlias(body, "progress"),
    details,
  );
  if (progress !== undefined) value.progress = progress;

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

  const budgetTotal = parseOptionalBudget(
    readAlias(body, "budgetTotal", "budget_total"),
    details,
  );
  if (budgetTotal !== undefined) value.budgetTotal = budgetTotal;

  const budgetCurrency = parseCurrency(
    readAlias(body, "budgetCurrency", "budget_currency"),
    details,
  );
  if (budgetCurrency !== undefined) value.budgetCurrency = budgetCurrency;

  const orgHintRaw = readAlias(body, "organizationId", "organization_id");
  if (typeof orgHintRaw === "string" && orgHintRaw.trim() !== "") {
    const hint = orgHintRaw.trim();
    if (!isUuid(hint)) {
      details.push(
        fail("organizationId", 'Field "organizationId" must be a valid UUID'),
      );
    } else {
      value.organizationIdHint = hint;
    }
  }

  checkDateOrder(value.startDate, value.endDate, details);

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value };
}

/** PATCH /api/projects/:id body — all fields optional, at least one required. */
export function parseProjectUpdateBody(
  body: unknown,
): MutationParseResult<ProjectUpdateInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [fail("body", "Request body must be a JSON object")],
    };
  }
  const details: ApiErrorDetail[] = [];
  const value = {} as ProjectUpdateInput;
  let present = 0;

  const track = (v: unknown): boolean => v !== undefined;

  const nameRaw = readAlias(body, "name");
  if (nameRaw !== undefined) {
    present += 1;
    const name = parseRequiredText(nameRaw, "name", 200, details);
    if (name !== undefined) value.name = name;
  }

  const codeRaw = readAlias(body, "code");
  if (codeRaw !== undefined) {
    present += 1;
    if (typeof codeRaw === "string" && codeRaw.trim() === "") {
      details.push(fail("code", 'Field "code" must not be empty'));
    } else {
      const code = parseCode(codeRaw, details);
      if (code !== undefined) value.code = code;
      else if (!details.some((d) => d.field === "code")) {
        details.push(fail("code", 'Field "code" is invalid'));
      }
    }
  }

  const descRaw = readAlias(body, "description");
  if (descRaw !== undefined) {
    present += 1;
    const description = parseOptionalText(descRaw, "description", 5000, details);
    if (description !== undefined) value.description = description;
  }

  const clientRaw = readAlias(body, "client");
  if (clientRaw !== undefined) {
    present += 1;
    const client = parseOptionalText(clientRaw, "client", 200, details);
    if (client !== undefined) value.client = client;
  }

  const managerRaw = readAlias(body, "managerId", "manager_id");
  if (managerRaw !== undefined) {
    present += 1;
    const managerId = parseOptionalUuid(managerRaw, "managerId", details);
    if (managerId !== undefined) value.managerId = managerId;
  }

  const methodRaw = readAlias(body, "method");
  if (methodRaw !== undefined) {
    present += 1;
    const method = parseOptionalEnum(methodRaw, "method", PROJECT_METHODS, details);
    if (method !== undefined) value.method = method;
    else if (track(methodRaw) && typeof methodRaw === "string" && methodRaw.trim() !== "" && !details.some((d) => d.field === "method")) {
      details.push(fail("method", 'Field "method" is invalid'));
    }
  }

  const statusRaw = readAlias(body, "status");
  if (statusRaw !== undefined) {
    present += 1;
    const status = parseOptionalEnum(statusRaw, "status", PROJECT_STATUSES, details);
    if (status !== undefined) value.status = status;
    else if (typeof statusRaw === "string" && statusRaw.trim() !== "" && !details.some((d) => d.field === "status")) {
      details.push(fail("status", 'Field "status" is invalid'));
    }
  }

  const priorityRaw = readAlias(body, "priority");
  if (priorityRaw !== undefined) {
    present += 1;
    const priority = parseOptionalEnum(priorityRaw, "priority", PROJECT_PRIORITIES, details);
    if (priority !== undefined) value.priority = priority;
    else if (typeof priorityRaw === "string" && priorityRaw.trim() !== "" && !details.some((d) => d.field === "priority")) {
      details.push(fail("priority", 'Field "priority" is invalid'));
    }
  }

  const progressRaw = readAlias(body, "progress");
  if (progressRaw !== undefined) {
    present += 1;
    const progress = parseOptionalProgress(progressRaw, details);
    if (progress !== undefined) value.progress = progress;
  }

  const startRaw = readAlias(body, "startDate", "start_date");
  if (startRaw !== undefined) {
    present += 1;
    const startDate = parseOptionalDate(startRaw, "startDate", details);
    if (startDate !== undefined) value.startDate = startDate;
  }

  const endRaw = readAlias(body, "endDate", "end_date");
  if (endRaw !== undefined) {
    present += 1;
    const endDate = parseOptionalDate(endRaw, "endDate", details);
    if (endDate !== undefined) value.endDate = endDate;
  }

  const budgetRaw = readAlias(body, "budgetTotal", "budget_total");
  if (budgetRaw !== undefined) {
    present += 1;
    const budgetTotal = parseOptionalBudget(budgetRaw, details);
    if (budgetTotal !== undefined) value.budgetTotal = budgetTotal;
  }

  const currencyRaw = readAlias(body, "budgetCurrency", "budget_currency");
  if (currencyRaw !== undefined) {
    present += 1;
    const budgetCurrency = parseCurrency(currencyRaw, details);
    if (budgetCurrency !== undefined) value.budgetCurrency = budgetCurrency;
    else if (typeof currencyRaw === "string" && currencyRaw.trim() !== "" && !details.some((d) => d.field === "budgetCurrency")) {
      details.push(fail("budgetCurrency", 'Field "budgetCurrency" is invalid'));
    }
  }

  const orgRaw = readAlias(body, "organizationId", "organization_id");
  if (typeof orgRaw === "string" && orgRaw.trim() !== "") {
    const attempt = orgRaw.trim();
    if (!isUuid(attempt)) {
      details.push(
        fail("organizationId", 'Field "organizationId" must be a valid UUID'),
      );
    } else {
      value.organizationIdAttempt = attempt;
    }
  }

  checkDateOrder(value.startDate, value.endDate, details);

  if (details.length > 0) return { ok: false, details };
  if (present === 0 && value.organizationIdAttempt === undefined) {
    return {
      ok: false,
      details: [fail("body", "Request body must include at least one editable field")],
    };
  }
  return { ok: true, value };
}
