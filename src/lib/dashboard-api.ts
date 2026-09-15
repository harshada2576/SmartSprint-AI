"use client";

/**
 * Frontend dashboard data-access layer.
 *
 * Single place that calls GET /api/dashboard and returns the typed payload.
 * Auth relies on the browser's existing Supabase session cookies
 * (sent automatically via `credentials: "same-origin"`). No database
 * credentials, service-role keys, or localStorage userIds are used here —
 * authorization is enforced server-side by the API route.
 *
 * RULE: Never import from supabase/ or ../db/ in this file. Keep it frontend-safe.
 */

import * as React from "react";
import type {
  DashboardActiveProjectItem,
  DashboardAttentionItem,
  DashboardDeadlineItem,
  DashboardErrorResponse,
  DashboardOrganization,
  DashboardRecentActivity,
  DashboardRecentProjectItem,
  DashboardResponse,
  DashboardStatValue,
} from "./api-mapping";

export type DashboardData = DashboardResponse["data"];

export type { DashboardResponse } from "./api-mapping";

export const DASHBOARD_ENDPOINT = "/api/dashboard";

export class DashboardApiError extends Error {
  readonly code: DashboardErrorResponse["error"]["code"] | "NETWORK_ERROR";
  readonly status: number;

  constructor(
    code: DashboardErrorResponse["error"]["code"] | "NETWORK_ERROR",
    message: string,
    status = 0
  ) {
    super(message);
    this.name = "DashboardApiError";
    this.code = code;
    this.status = status;
  }

  get isUnauthenticated(): boolean {
    return this.code === "UNAUTHENTICATED" || this.status === 401;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNumberOrString(value: unknown): number | string {
  return typeof value === "number" || typeof value === "string" ? value : "—";
}

function normalizeStat(value: unknown): DashboardStatValue {
  if (isRecord(value)) {
    return {
      value: toNumberOrString(value.value),
      trend: toStringOr(value.trend, ""),
    };
  }
  return { value: "—", trend: "" };
}

function normalizeName(value: unknown, fallback: string): { id: string; name: string } {
  if (isRecord(value)) {
    return {
      id: toStringOr(value.id, ""),
      name: toStringOr(value.name, fallback),
    };
  }
  if (typeof value === "string" && value.length > 0) {
    return { id: "", name: value };
  }
  return { id: "", name: fallback };
}

function normalizeRecentProject(value: unknown, index: number): DashboardRecentProjectItem | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  return {
    id: String(id),
    name: toStringOr(value.name, "Untitled project"),
    client: toStringOr(value.client, ""),
    status: toStringOr(value.status, "pending"),
    progress: typeof value.progress === "number" ? value.progress : 0,
    updatedAt: toStringOr(value.updatedAt, toStringOr(value.lastUpdated, "")),
    manager: isRecord(value.manager) || typeof value.manager === "string"
      ? normalizeName(value.manager, "")
      : undefined,
    currentSprint: isRecord(value.currentSprint) || typeof value.currentSprint === "string"
      ? { id: toStringOr((value.currentSprint as Record<string, unknown>).id, ""), name: toStringOr((value.currentSprint as Record<string, unknown>).name, typeof value.currentSprint === "string" ? (value.currentSprint as string) : "") }
      : undefined,
  };
}

function normalizeActiveProject(value: unknown, index: number): DashboardActiveProjectItem | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const sprint = isRecord(value.currentSprint)
    ? {
        id: toStringOr(value.currentSprint.id, ""),
        name: toStringOr(value.currentSprint.name, toStringOr(value.sprint, "—")),
      }
    : { id: "", name: toStringOr(value.sprint, "—") };
  return {
    id: String(id),
    name: toStringOr(value.name, `Project ${index + 1}`),
    client: toStringOr(value.client, ""),
    manager: normalizeName(value.manager, "Unassigned"),
    status: toStringOr(value.status, "pending"),
    progress: typeof value.progress === "number" ? value.progress : 0,
    currentSprint: sprint,
    endDate: toStringOr(value.endDate, ""),
  };
}

function normalizeDeadline(value: unknown): DashboardDeadlineItem | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const kind = value.kind === "task" ? "task" : "sprint";
  return {
    kind,
    id: String(id),
    title: toStringOr(value.title, toStringOr(value.name, "Untitled")),
    project: normalizeName(value.project, ""),
    dueDate: toStringOr(value.dueDate, toStringOr(value.endDate, "")),
    daysRemaining: typeof value.daysRemaining === "number" ? value.daysRemaining : undefined,
  };
}

function normalizeAttentionItem(value: unknown): DashboardAttentionItem | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const kind = value.kind === "requirement" ? "requirement" : "task";
  const priority =
    value.priority === "high" || value.priority === "medium" || value.priority === "low"
      ? value.priority
      : "medium";
  const project = isRecord(value.project)
    ? { id: toStringOr(value.project.id, ""), name: toStringOr(value.project.name, "") }
    : { id: "", name: toStringOr(value.project, "") };
  return {
    kind,
    id: String(id),
    displayId: toStringOr(value.displayId, String(id)),
    title: toStringOr(value.title, "Untitled"),
    priority,
    status: toStringOr(value.status, ""),
    project,
    assignee: isRecord(value.assignee) || typeof value.assignee === "string"
      ? normalizeName(value.assignee, "")
      : undefined,
  };
}

/**
 * Normalizes a recent-activity entry. Accepts both the flat UI shape
 * ({ action, project, user, time }) and the §7.2 object shape
 * ({ actor: { name }, project: { name }, createdAt }).
 */
function normalizeActivity(value: unknown, index: number): DashboardRecentActivity | null {
  if (!isRecord(value)) return null;
  const project = isRecord(value.project)
    ? toStringOr(value.project.name, "")
    : toStringOr(value.project, "");
  const user = isRecord(value.actor)
    ? toStringOr(value.actor.name, "")
    : toStringOr(value.user, toStringOr(value.actor, "System"));
  const time = toStringOr(value.time, toStringOr(value.createdAt, ""));
  const action = toStringOr(value.action, "");
  if (!action && !project) return null;
  const id = typeof value.id === "number" ? value.id : index;
  return { id, action: action || "Activity", project, user: user || "System", time };
}

function normalizeList<T>(value: unknown, normalize: (item: unknown, index: number) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = normalize(value[i], i);
    if (item !== null) out.push(item);
  }
  return out;
}

function normalizeOrganization(value: unknown): DashboardOrganization {
  if (isRecord(value)) {
    return {
      id: toStringOr(value.id, ""),
      name: toStringOr(value.name, ""),
      slug: toStringOr(value.slug, ""),
    };
  }
  return { id: "", name: "", slug: "" };
}

/** Shape guard for the { success, data } envelope — tolerant of extra fields. */
function normalizeDashboardData(payload: unknown): DashboardData {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : {};
  const stats = isRecord(data.stats) ? data.stats : {};
  return {
    organization: normalizeOrganization(data.organization),
    stats: {
      activeProjects: normalizeStat(stats.activeProjects),
      teamMembers: normalizeStat(stats.teamMembers),
      upcomingDeadlines: normalizeStat(stats.upcomingDeadlines),
      needsAttention: normalizeStat(stats.needsAttention),
    },
    recentProjects: normalizeList<DashboardRecentProjectItem>(data.recentProjects, normalizeRecentProject),
    activeProjects: normalizeList<DashboardActiveProjectItem>(data.activeProjects, normalizeActiveProject),
    upcomingDeadlines: normalizeList<DashboardDeadlineItem>(data.upcomingDeadlines, normalizeDeadline),
    attentionItems: normalizeList<DashboardAttentionItem>(data.attentionItems, normalizeAttentionItem),
    recentActivity: normalizeList<DashboardRecentActivity>(data.recentActivity, normalizeActivity),
  };
}

function readErrorPayload(payload: unknown): { code: DashboardApiError["code"]; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const { code, message } = payload.error;
  if (typeof message !== "string" || message.length === 0) return null;
  const known: Array<DashboardApiError["code"]> = [
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "INTERNAL_ERROR",
  ];
  return {
    code: typeof code === "string" && (known as Array<string>).includes(code)
      ? (code as DashboardApiError["code"])
      : "INTERNAL_ERROR",
    message,
  };
}

/**
 * Calls GET /api/dashboard using the browser's authenticated session
 * (Supabase cookies are sent automatically). Never fabricates data:
 * any failure throws DashboardApiError for the UI to render as an error state.
 */
export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardData> {
  let response: Response;
  try {
    response = await fetch(DASHBOARD_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new DashboardApiError(
      "NETWORK_ERROR",
      "Could not reach the dashboard service. Check your connection and try again."
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const parsed = payload !== null ? readErrorPayload(payload) : null;
    if (response.status === 401) {
      throw new DashboardApiError(
        "UNAUTHENTICATED",
        parsed?.message ?? "Your session has expired. Please sign in again.",
        401
      );
    }
    throw new DashboardApiError(
      parsed?.code ?? "INTERNAL_ERROR",
      parsed?.message ?? `Dashboard request failed (HTTP ${response.status}).`,
      response.status
    );
  }

  if (!isRecord(payload) || payload.success !== true) {
    const parsed = payload !== null ? readErrorPayload(payload) : null;
    throw new DashboardApiError(
      parsed?.code ?? "INTERNAL_ERROR",
      parsed?.message ?? "Dashboard service returned an unexpected response.",
      response.status
    );
  }

  return normalizeDashboardData(payload);
}

export interface UseDashboardResult {
  data: DashboardData | null;
  error: DashboardApiError | null;
  isLoading: boolean;
  retry: () => void;
}

/** React hook powering the dashboard page. No mock fallback — error state is explicit. */
export function useDashboard(): UseDashboardResult {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState<DashboardApiError | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchDashboard(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(
          fetchError instanceof DashboardApiError
            ? fetchError
            : new DashboardApiError("INTERNAL_ERROR", "Something went wrong loading the dashboard.")
        );
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    setAttempt((count) => count + 1);
  }, []);

  return { data, error, isLoading, retry };
}
