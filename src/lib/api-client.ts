"use client";

/**
 * Shared frontend collection data-access layer.
 *
 * Single consistent pattern for every list page backed by a real backend
 * endpoint (GET /api/projects, /api/requirements, /api/sprints, /api/tasks,
 * /api/backlog, /api/notifications, /api/ai-recommendations).
 *
 * Mirrors the conventions of `@/lib/dashboard-api` (same-origin cookies,
 * no-store, typed ApiError, hook with retry, never falls back to mock data):
 * - Auth relies on the browser's Supabase session cookies
 *   (`credentials: "same-origin"`). No database credentials, service-role
 *   keys, or localStorage userIds are used here.
 * - Every collection is server-paginated (`page`/`pageSize`, max 100).
 *   Pages must not load unbounded result sets into the browser.
 * - Failures throw `ApiError` for the UI to render with the existing
 *   error/empty-state patterns. Fake data is never substituted.
 *
 * RULE: Never import from supabase/ or ../db/ in this file. Keep it frontend-safe.
 */

import * as React from "react";

// ---------------------------------------------------------------------------
// Error + envelope types
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  get isUnauthenticated(): boolean {
    return this.code === "UNAUTHENTICATED" || this.status === 401;
  }
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CollectionResult<T> {
  items: T[];
  pagination: PaginationMeta;
  /** Extra response-level data (e.g. notifications `unreadCount`). */
  meta: Record<string, unknown>;
}

export type Normalizer<T> = (value: unknown) => T | null;

// ---------------------------------------------------------------------------
// Safe-access primitives (no `any`, tolerant of unexpected shapes)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBooleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function readErrorPayload(
  payload: unknown,
): { code: ApiErrorCode; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const { code, message } = payload.error;
  if (typeof message !== "string" || message.length === 0) return null;
  const known: ApiErrorCode[] = [
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "INTERNAL_ERROR",
  ];
  return {
    code:
      typeof code === "string" &&
      (known as string[]).includes(code)
        ? (code as ApiErrorCode)
        : "INTERNAL_ERROR",
    message,
  };
}

function normalizePagination(value: unknown): PaginationMeta {
  if (isRecord(value)) {
    return {
      page: toNumberOr(value.page, 1),
      pageSize: toNumberOr(value.pageSize, 20),
      total: toNumberOr(value.total, 0),
      totalPages: toNumberOr(value.totalPages, 0),
    };
  }
  return { page: 1, pageSize: 20, total: 0, totalPages: 0 };
}

// ---------------------------------------------------------------------------
// Query + fetch helpers
// ---------------------------------------------------------------------------

export type QueryValue = string | number | boolean | undefined | null;

/** Builds `?a=1&b=2`, skipping undefined/null/empty values. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    search.set(key, text);
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function throwForStatus(
  response: Response,
  payload: unknown,
  fallback: string,
): never {
  const parsed = payload !== null ? readErrorPayload(payload) : null;
  if (response.status === 401) {
    throw new ApiError(
      "UNAUTHENTICATED",
      parsed?.message ?? "Your session has expired. Please sign in again.",
      401,
    );
  }
  throw new ApiError(
    parsed?.code ?? "INTERNAL_ERROR",
    parsed?.message ?? `${fallback} (HTTP ${response.status}).`,
    response.status,
  );
}

async function getJson(
  url: string,
  signal: AbortSignal | undefined,
  fallback: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  const payload = await parseJson(response);
  if (!response.ok) throwForStatus(response, payload, fallback);
  if (!isRecord(payload) || payload.success !== true) {
    const parsed = payload !== null ? readErrorPayload(payload) : null;
    throw new ApiError(
      parsed?.code ?? "INTERNAL_ERROR",
      parsed?.message ?? "The server returned an unexpected response.",
      response.status,
    );
  }
  return payload;
}

/**
 * GETs a paginated collection. Never fabricates rows: malformed entries are
 * dropped by `normalize`, failures throw `ApiError`.
 */
export async function fetchCollection<T>(
  endpoint: string,
  normalize: Normalizer<T>,
  options?: {
    signal?: AbortSignal;
    params?: Record<string, QueryValue>;
    fallback?: string;
  },
): Promise<CollectionResult<T>> {
  const url = `${endpoint}${buildQuery(options?.params ?? {})}`;
  const payload = await getJson(
    url,
    options?.signal,
    options?.fallback ?? "Request failed",
  );
  if (!isRecord(payload)) {
    throw new ApiError("INTERNAL_ERROR", "The server returned an unexpected response.");
  }
  const raw = Array.isArray(payload.data) ? payload.data : [];
  const items: T[] = [];
  for (const entry of raw) {
    const item = normalize(entry);
    if (item !== null) items.push(item);
  }
  return {
    items,
    pagination: normalizePagination(payload.pagination),
    meta: isRecord(payload.meta) ? payload.meta : {},
  };
}

/**
 * POSTs a JSON body to an endpoint. Only the fields the backend accepts are
 * ever sent; failures throw `ApiError`.
 */
export async function postJson<T>(
  endpoint: string,
  body: Record<string, unknown>,
  normalize: Normalizer<T>,
  options?: { signal?: AbortSignal; fallback?: string },
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  const payload = await parseJson(response);
  if (!response.ok) throwForStatus(response, payload, options?.fallback ?? "Create failed");
  if (!isRecord(payload) || payload.success !== true) {
    const parsed = payload !== null ? readErrorPayload(payload) : null;
    throw new ApiError(
      parsed?.code ?? "INTERNAL_ERROR",
      parsed?.message ?? "The server returned an unexpected response.",
      response.status,
    );
  }
  return normalize(payload.data);
}

/**
 * PATCHes a resource (used for notification read-state). Only the fields the
 * backend accepts are ever sent; failures throw `ApiError`.
 */
export async function patchJson<T>(
  endpoint: string,
  body: Record<string, unknown>,
  normalize: Normalizer<T>,
  options?: { signal?: AbortSignal; fallback?: string },
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  const payload = await parseJson(response);
  if (!response.ok) throwForStatus(response, payload, options?.fallback ?? "Update failed");
  if (!isRecord(payload) || payload.success !== true) {
    const parsed = payload !== null ? readErrorPayload(payload) : null;
    throw new ApiError(
      parsed?.code ?? "INTERNAL_ERROR",
      parsed?.message ?? "The server returned an unexpected response.",
      response.status,
    );
  }
  return normalize(payload.data);
}

// ---------------------------------------------------------------------------
// React hooks — one loading/error/retry pattern for all pages
// ---------------------------------------------------------------------------

export interface UseCollectionResult<T> {
  items: T[];
  pagination: PaginationMeta;
  meta: Record<string, unknown>;
  error: ApiError | null;
  isLoading: boolean;
  retry: () => void;
}

/**
 * Loads a paginated collection. `query` must be a memoized `?…` string
 * (see `buildQuery`); the request re-runs when it changes. No mock fallback.
 *
 * Loading state is derived by comparing the loaded snapshot key with the
 * requested key, so no setState-in-effect is needed.
 */
export function useCollection<T>(
  endpoint: string,
  normalize: Normalizer<T>,
  query = "",
): UseCollectionResult<T> {
  const key = `${endpoint}${query}`;
  const [attempt, setAttempt] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    items: T[];
    pagination: PaginationMeta;
    meta: Record<string, unknown>;
    error: ApiError | null;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const payload = await getJson(key, controller.signal, "Could not load data");
        if (!isRecord(payload)) {
          throw new ApiError(
            "INTERNAL_ERROR",
            "The server returned an unexpected response.",
          );
        }
        const raw = Array.isArray(payload.data) ? payload.data : [];
        const next: T[] = [];
        for (const entry of raw) {
          const item = normalize(entry);
          if (item !== null) next.push(item);
        }
        if (cancelled) return;
        setSnapshot({
          key,
          items: next,
          pagination: normalizePagination(payload.pagination),
          meta: isRecord(payload.meta) ? payload.meta : {},
          error: null,
        });
      } catch (fetchError: unknown) {
        if (cancelled) return;
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        )
          return;
        setSnapshot({
          key,
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          meta: {},
          error:
            fetchError instanceof ApiError
              ? fetchError
              : new ApiError("INTERNAL_ERROR", "Something went wrong loading data."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `key` fully describes the request; `normalize` is a module-level pure
    // function and `attempt` is the manual retry counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = React.useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const current = snapshot !== null && snapshot.key === key ? snapshot : null;
  return {
    items: current?.items ?? [],
    pagination: current?.pagination ?? {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
    meta: current?.meta ?? {},
    error: current?.error ?? null,
    isLoading: current === null,
    retry,
  };
}

export interface StatusCounts {
  /** Total across all statuses (unfiltered `pageSize=1` probe). */
  total: number;
  /** Total per requested status value. */
  byStatus: Record<string, number>;
}

/**
 * Fetches real per-status totals with cheap `pageSize=1` probes (only the
 * pagination metadata is used). Powers filter-tab count badges without
 * loading record bodies.
 */
export function useStatusCounts(
  endpoint: string,
  statuses: string[],
): { counts: StatusCounts; error: ApiError | null; isLoading: boolean; retry: () => void } {
  const [attempt, setAttempt] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    counts: StatusCounts;
    error: ApiError | null;
  } | null>(null);
  const key = React.useMemo(
    () => JSON.stringify({ endpoint, statuses }),
    [endpoint, statuses],
  );

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const probes: Array<{ status: string | null; promise: Promise<CollectionResult<unknown>> }> = [
          {
            status: null,
            promise: fetchCollection<unknown>(endpoint, () => null, {
              signal: controller.signal,
              params: { page: 1, pageSize: 1 },
              fallback: "Could not load counts",
            }),
          },
          ...statuses.map((status) => ({
            status,
            promise: fetchCollection<unknown>(endpoint, () => null, {
              signal: controller.signal,
              params: { page: 1, pageSize: 1, status },
              fallback: "Could not load counts",
            }),
          })),
        ];
        const settled = await Promise.all(probes.map((probe) => probe.promise));
        if (cancelled) return;
        const byStatus: Record<string, number> = {};
        settled.forEach((result, index) => {
          const status = probes[index]?.status;
          if (status !== null && status !== undefined) {
            byStatus[status] = result.pagination.total;
          }
        });
        setSnapshot({
          key,
          counts: { total: settled[0]?.pagination.total ?? 0, byStatus },
          error: null,
        });
      } catch (fetchError: unknown) {
        if (cancelled) return;
        if (fetchError instanceof DOMException && fetchError.name === "AbortError")
          return;
        setSnapshot({
          key,
          counts: { total: 0, byStatus: {} },
          error:
            fetchError instanceof ApiError
              ? fetchError
              : new ApiError("INTERNAL_ERROR", "Something went wrong loading counts."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = React.useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const current = snapshot !== null && snapshot.key === key ? snapshot : null;
  return {
    counts: current?.counts ?? { total: 0, byStatus: {} },
    error: current?.error ?? null,
    isLoading: current === null,
    retry,
  };
}

/** Debounces a fast-changing input (e.g. search) before it becomes a query. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Collection row shapes (frontend-safe mirrors of backend rows)
// ---------------------------------------------------------------------------

export interface ProjectItem {
  id: string;
  name: string;
  code: string | null;
  client: string | null;
  /** Manager user id (names need a users endpoint — see integration report). */
  managerId: string | null;
  method: string;
  status: string;
  priority: string;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeProject(value: unknown): ProjectItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  return {
    id: value.id,
    name: toStringOr(value.name, "Untitled project"),
    code: toNullableString(value.code),
    client: toNullableString(value.client),
    managerId: toNullableString(value.manager_id),
    method: toStringOr(value.method, ""),
    status: toStringOr(value.status, "pending"),
    priority: toStringOr(value.priority, "medium"),
    progress: toNumberOr(value.progress, 0),
    startDate: toNullableString(value.start_date),
    endDate: toNullableString(value.end_date),
    createdAt: toStringOr(value.created_at, ""),
    updatedAt: toStringOr(value.updated_at, ""),
  };
}

export interface RequirementItem {
  id: string;
  displayId: string;
  projectId: string;
  title: string;
  description: string | null;
  category: string;
  businessValue: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  sprintId: string | null;
  storyPoints: number | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeRequirement(value: unknown): RequirementItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  return {
    id: value.id,
    displayId: toStringOr(value.display_id, value.id),
    projectId: toStringOr(value.project_id, ""),
    title: toStringOr(value.title, "Untitled requirement"),
    description: toNullableString(value.description),
    category: toStringOr(value.category, ""),
    businessValue: toStringOr(value.business_value, ""),
    priority: toStringOr(value.priority, "medium"),
    status: toStringOr(value.status, "draft"),
    assigneeId: toNullableString(value.assignee_id),
    sprintId: toNullableString(value.sprint_id),
    storyPoints: toNullableNumber(value.story_points),
    createdAt: toStringOr(value.created_at, ""),
    updatedAt: toStringOr(value.updated_at, ""),
  };
}

export interface SprintItem {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalPoints: number | null;
  completedPoints: number | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeSprint(value: unknown): SprintItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  return {
    id: value.id,
    projectId: toStringOr(value.project_id, ""),
    name: toStringOr(value.name, "Untitled sprint"),
    goal: toNullableString(value.goal),
    status: toStringOr(value.status, "planning"),
    startDate: toNullableString(value.start_date),
    endDate: toNullableString(value.end_date),
    totalPoints: toNullableNumber(value.total_points),
    completedPoints: toNullableNumber(value.completed_points),
    createdAt: toStringOr(value.created_at, ""),
    updatedAt: toStringOr(value.updated_at, ""),
  };
}

export interface TaskItem {
  id: string;
  displayId: string;
  projectId: string;
  sprintId: string | null;
  requirementId: string | null;
  title: string;
  description: string | null;
  priority: string;
  points: number | null;
  assigneeId: string | null;
  /** Backend `column_status` (backlog/todo/inProgress/review/testing/done). */
  columnStatus: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeTask(value: unknown): TaskItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  return {
    id: value.id,
    displayId: toStringOr(value.display_id, value.id),
    projectId: toStringOr(value.project_id, ""),
    sprintId: toNullableString(value.sprint_id),
    requirementId: toNullableString(value.requirement_id),
    title: toStringOr(value.title, "Untitled task"),
    description: toNullableString(value.description),
    priority: toStringOr(value.priority, "medium"),
    points: toNullableNumber(value.points),
    assigneeId: toNullableString(value.assignee_id),
    columnStatus: toStringOr(value.column_status, toStringOr(value.status, "backlog")),
    dueDate: toNullableString(value.due_date),
    createdAt: toStringOr(value.created_at, ""),
    updatedAt: toStringOr(value.updated_at, ""),
  };
}

export interface BacklogRequirement {
  id: string;
  displayId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  storyPoints: number | null;
  assigneeId: string | null;
  sprintId: string | null;
}

export interface BacklogItem {
  id: string;
  projectId: string;
  requirementId: string;
  rank: number;
  createdAt: string;
  requirement: BacklogRequirement;
}

export function normalizeBacklogItem(value: unknown): BacklogItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (!isRecord(value.requirements)) return null;
  const req = value.requirements;
  if (typeof req.id !== "string" || req.id.length === 0) return null;
  return {
    id: value.id,
    projectId: toStringOr(value.project_id, ""),
    requirementId: toStringOr(value.requirement_id, toStringOr(req.id, "")),
    rank: toNumberOr(value.rank, 0),
    createdAt: toStringOr(value.created_at, ""),
    requirement: {
      id: req.id,
      displayId: toStringOr(req.display_id, req.id),
      title: toStringOr(req.title, "Untitled requirement"),
      description: toNullableString(req.description),
      status: toStringOr(req.status, "draft"),
      priority: toStringOr(req.priority, "medium"),
      category: toStringOr(req.category, ""),
      storyPoints: toNullableNumber(req.story_points),
      assigneeId: toNullableString(req.assignee_id),
      sprintId: toNullableString(req.sprint_id),
    },
  };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  read: boolean;
  actionLabel: string | null;
  createdAt: string;
}

export function normalizeNotification(value: unknown): NotificationItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  return {
    id: value.id,
    type: toStringOr(value.type, "system"),
    title: toStringOr(value.title, "Notification"),
    description: toStringOr(value.description, ""),
    priority: toStringOr(value.priority, "low"),
    read: toBooleanOr(value.read, false),
    actionLabel: toNullableString(value.action_label),
    createdAt: toStringOr(value.created_at, ""),
  };
}

export interface AiRecommendationRequirement {
  id: string;
  projectId: string;
  displayId: string;
  title: string;
  status: string;
}

export interface AiRecommendationItem {
  id: string;
  requirementId: string;
  suggestedPriority: string | null;
  suggestedSprintId: string | null;
  confidenceScore: number | null;
  summary: string | null;
  reasoning: string[];
  recommendationStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  requirement: AiRecommendationRequirement;
}

export function normalizeAiRecommendation(
  value: unknown,
): AiRecommendationItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (!isRecord(value.requirements)) return null;
  const req = value.requirements;
  if (typeof req.id !== "string" || req.id.length === 0) return null;
  const reasoningRaw: unknown = value.reasoning;
  return {
    id: value.id,
    requirementId: toStringOr(value.requirement_id, req.id),
    suggestedPriority: toNullableString(value.suggested_priority),
    suggestedSprintId: toNullableString(value.suggested_sprint_id),
    confidenceScore: toNullableNumber(value.confidence_score),
    summary: toNullableString(value.summary),
    reasoning: toStringArray(reasoningRaw),
    recommendationStatus: toStringOr(
      value.recommendation_status,
      toStringOr(value.status, "pending"),
    ),
    approvedBy: toNullableString(value.approved_by),
    approvedAt: toNullableString(value.approved_at),
    createdAt: toStringOr(value.created_at, ""),
    requirement: {
      id: req.id,
      projectId: toStringOr(req.project_id, ""),
      displayId: toStringOr(req.display_id, req.id),
      title: toStringOr(req.title, "Untitled requirement"),
      status: toStringOr(req.status, ""),
    },
  };
}

// ---------------------------------------------------------------------------
// Display helpers (presentation only — no business facts invented)
// ---------------------------------------------------------------------------

/** Short stable reference for UUID foreign keys shown until names resolve. */
export function shortId(id: string | null): string {
  if (!id) return "Unassigned";
  return id.length > 8 ? `ID ${id.slice(0, 8)}` : `ID ${id}`;
}

/** Stage-based progress estimate — the tasks API exposes no percent-complete. */
export function taskStageProgress(columnStatus: string): number {
  switch (columnStatus) {
    case "done":
      return 100;
    case "review":
    case "testing":
      return 75;
    case "inProgress":
      return 50;
    default:
      return 0;
  }
}
