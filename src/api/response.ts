import { NextResponse } from "next/server";
import type {
  ApiErrorCode,
  ApiErrorDetail,
  PaginationMeta,
} from "@/types/api";

export type { ApiErrorCode, ApiErrorDetail } from "@/types/api";

/**
 * Canonical backend API response helpers.
 *
 * Ownership: Backend/API agent (`src/api/**`).
 *
 * Single error envelope `{ success: false, error: { code, message, details? } }`
 * and single success envelope `{ success: true, data, pagination?, meta? }`
 * shared by ALL user-facing endpoints. HTTP status is derived from the error
 * code via `STATUS_BY_CODE` so a code can never be paired with the wrong
 * status.
 *
 * Rules enforced here:
 * - Internal details (SQL, stacks, keys, DSNs) are never serialized. Callers
 *   log the raw error server-side and return the generic `INTERNAL_ERROR`
 *   shape below.
 * - Generic 401/403 messages leak no reason details; missing rows and rows
 *   outside the caller's scope share the same 404/empty answers (no oracle).
 */

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status: STATUS_BY_CODE[code] },
  );
}

/** 401 — no valid Supabase session/JWT on the request. */
export function unauthenticatedResponse(): NextResponse {
  return errorResponse("UNAUTHENTICATED", "Authentication required");
}

/** 403 — authenticated but not permitted. No reason details leaked. */
export function forbiddenResponse(
  message = "Insufficient permissions",
): NextResponse {
  return errorResponse("FORBIDDEN", message);
}

/** 404 — covers both "missing" and "not visible to caller" (no oracle). */
export function notFoundResponse(
  message = "Resource not found",
): NextResponse {
  return errorResponse("NOT_FOUND", message);
}

/** 400 — malformed query/path/body values, with per-field details. */
export function validationErrorResponse(
  details: ApiErrorDetail[],
  message = "Invalid request parameters",
): NextResponse {
  return errorResponse("VALIDATION_ERROR", message, details);
}

/**
 * 500 — generic only. The raw error must be logged server-side by the caller
 * via `console.error` and never passed here.
 */
export function internalErrorResponse(): NextResponse {
  // Generic by design: never surface SQL errors, stack traces, credentials,
  // or service-role secrets. Details are logged server-side at the call site.
  return errorResponse("INTERNAL_ERROR", "Something went wrong");
}

/** 200 — success envelope with optional pagination metadata and meta. */
export function successResponse<T>(
  data: T,
  init?: { pagination?: PaginationMeta; meta?: unknown },
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(init?.pagination !== undefined
        ? { pagination: init.pagination }
        : {}),
      ...(init?.meta !== undefined ? { meta: init.meta } : {}),
    },
    { status: 200 },
  );
}
