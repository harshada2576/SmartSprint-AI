import type { NextResponse } from "next/server";
import { validationErrorResponse } from "@/api/response";
import type { ApiErrorDetail } from "@/api/response";
import {
  MAX_SEARCH_LENGTH,
  getQueryParam,
  isUuid,
} from "./query-params";

/** Notification channels (`notifications.type`). */
export const NOTIFICATION_TYPES = [
  "task",
  "sprint",
  "approval",
  "document",
  "budget",
  "system",
] as const;

export type NotificationTypeFilter = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["high", "medium", "low"] as const;

export type NotificationPriorityFilter =
  (typeof NOTIFICATION_PRIORITIES)[number];

export interface NotificationQueryFilters {
  type?: NotificationTypeFilter;
  read?: boolean;
  priority?: NotificationPriorityFilter;
  search?: string;
}

export type NotificationQueryResult =
  | { filters: NotificationQueryFilters }
  | { response: NextResponse };

function parseReadParam(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "read"
  ) {
    return true;
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "unread"
  ) {
    return false;
  }
  return null;
}

/**
 * Validates `GET /api/notifications` query parameters.
 *
 * Privacy rule: `userId` / `user_id` (and any organization/role
 * parameters) are deliberately NOT read here. The inbox owner is always
 * the authenticated caller; a caller-supplied user ID can never select
 * another user's notifications.
 */
export function validateNotificationQuery(
  searchParams: URLSearchParams,
): NotificationQueryResult {
  const details: ApiErrorDetail[] = [];
  const filters: NotificationQueryFilters = {};

  const type = getQueryParam(searchParams, "type");
  if (type !== null) {
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      details.push({
        field: "type",
        message: `Query parameter "type" must be one of: ${NOTIFICATION_TYPES.join(", ")}`,
      });
    } else {
      filters.type = type as NotificationTypeFilter;
    }
  }

  const read = getQueryParam(searchParams, "read");
  if (read !== null) {
    const parsed = parseReadParam(read);
    if (parsed === null) {
      details.push({
        field: "read",
        message:
          'Query parameter "read" must be a boolean ("true"/"false") or "read"/"unread"',
      });
    } else {
      filters.read = parsed;
    }
  }

  const priority = getQueryParam(searchParams, "priority");
  if (priority !== null) {
    if (
      !(NOTIFICATION_PRIORITIES as readonly string[]).includes(priority)
    ) {
      details.push({
        field: "priority",
        message: `Query parameter "priority" must be one of: ${NOTIFICATION_PRIORITIES.join(", ")}`,
      });
    } else {
      filters.priority = priority as NotificationPriorityFilter;
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

export type MarkReadRequest =
  | { kind: "single"; id: string; read: boolean }
  | { kind: "all" };

export type MarkReadRequestResult =
  | { request: MarkReadRequest }
  | { response: NextResponse };

/**
 * Validates `PATCH /api/notifications` bodies. Only two shapes are
 * accepted: `{ "id": "<uuid>", "read"?: boolean }` to flip one owned
 * notification, or `{ "markAllRead": true }` to mark the caller's whole
 * inbox read. Any `userId` / `user_id` / organization / role fields in
 * the body are ignored — ownership always comes from the session, so a
 * caller (including a DEVELOPER) can only mutate their own rows.
 */
export function validateMarkReadBody(
  body: unknown,
): MarkReadRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      response: validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]),
    };
  }
  const record = body as Record<string, unknown>;

  if (record.markAllRead === true) {
    return { request: { kind: "all" } };
  }

  if (typeof record.id !== "string" || record.id.trim() === "") {
    return {
      response: validationErrorResponse([
        {
          field: "id",
          message:
            'Field "id" is required and must be a notification ID, or use { "markAllRead": true }',
        },
      ]),
    };
  }
  if (!isUuid(record.id.trim())) {
    return {
      response: validationErrorResponse([
        { field: "id", message: 'Field "id" must be a valid UUID' },
      ]),
    };
  }

  let read = true;
  if (record.read !== undefined) {
    if (typeof record.read !== "boolean") {
      return {
        response: validationErrorResponse([
          { field: "read", message: 'Field "read" must be a boolean' },
        ]),
      };
    }
    read = record.read;
  }

  return { request: { kind: "single", id: record.id.trim(), read } };
}
