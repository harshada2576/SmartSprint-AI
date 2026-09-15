import type { NextResponse } from "next/server";
import { validationErrorResponse } from "@/api/response";
import type { ApiErrorDetail } from "@/api/response";
import {
  MAX_SEARCH_LENGTH,
  getQueryParam,
  isUuid,
} from "./query-params";

/** Requirement statuses filterable on the backlog (joined requirement). */
export const BACKLOG_STATUSES = [
  "draft",
  "pending",
  "inProgress",
  "review",
  "testing",
  "completed",
  "blocked",
] as const;

export type BacklogStatusFilter = (typeof BACKLOG_STATUSES)[number];

/** Requirement priorities filterable on the backlog (joined requirement). */
export const BACKLOG_PRIORITIES = ["high", "medium", "low"] as const;

export type BacklogPriorityFilter = (typeof BACKLOG_PRIORITIES)[number];

export interface BacklogQueryFilters {
  projectId?: string;
  status?: BacklogStatusFilter;
  priority?: BacklogPriorityFilter;
  search?: string;
}

export type BacklogQueryResult =
  | { filters: BacklogQueryFilters }
  | { response: NextResponse };

/**
 * Validates `GET /api/backlog` query parameters. Accepts `projectId`
 * (or legacy `project_id`); `status` / `priority` apply to the joined
 * requirement; `search` matches requirement title / display ID /
 * description. Unknown parameters are ignored. Never accepts organization
 * IDs, user IDs, roles, or membership claims.
 */
export function validateBacklogQuery(
  searchParams: URLSearchParams,
): BacklogQueryResult {
  const details: ApiErrorDetail[] = [];
  const filters: BacklogQueryFilters = {};

  const projectId = getQueryParam(searchParams, "projectId", "project_id");
  if (projectId !== null) {
    if (!isUuid(projectId)) {
      details.push({
        field: "projectId",
        message: 'Query parameter "projectId" must be a valid UUID',
      });
    } else {
      filters.projectId = projectId;
    }
  }

  const status = getQueryParam(searchParams, "status");
  if (status !== null) {
    if (
      !(BACKLOG_STATUSES as readonly string[]).includes(status)
    ) {
      details.push({
        field: "status",
        message: `Query parameter "status" must be one of: ${BACKLOG_STATUSES.join(", ")}`,
      });
    } else {
      filters.status = status as BacklogStatusFilter;
    }
  }

  const priority = getQueryParam(searchParams, "priority");
  if (priority !== null) {
    if (
      !(BACKLOG_PRIORITIES as readonly string[]).includes(priority)
    ) {
      details.push({
        field: "priority",
        message: `Query parameter "priority" must be one of: ${BACKLOG_PRIORITIES.join(", ")}`,
      });
    } else {
      filters.priority = priority as BacklogPriorityFilter;
    }
  }

  const search = getQueryParam(searchParams, "search");
  if (search !== null) {
    if (search.length > MAX_SEARCH_LENGTH) {
      details.push({
        field: "search",
        message: `Query parameter "search" must be at most ${MAX_SEARCH_LENGTH} characters`,
      });
    } else {
      filters.search = search;
    }
  }

  if (details.length > 0) {
    return { response: validationErrorResponse(details) };
  }
  return { filters };
}
