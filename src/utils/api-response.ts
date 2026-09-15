import { NextResponse } from "next/server";
import type {
  ApiErrorCode,
  ApiErrorDetail,
  PaginationMeta,
} from "@/types/api";

/**
 * Shared backend API response + pagination helpers.
 *
 * Ownership: Backend/API agent (`src/utils/**`).
 *
 * Rules enforced here:
 * - Single error envelope; internal details (SQL, stacks, keys, DSNs) are
 *   never serialized. Callers log the raw error server-side and return the
 *   generic `INTERNAL_ERROR` shape below.
 * - Pagination uses `?page=1&pageSize=20` (`limit` accepted as a `pageSize`
 *   alias). `pageSize` is clamped to a maximum of 100. Collections never
 *   return unbounded results.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

function errorResponse(
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
export function unauthenticated(): NextResponse {
  return errorResponse("UNAUTHENTICATED", "Authentication required");
}

/** 403 — authenticated but not permitted. No reason details leaked. */
export function forbidden(message = "Access denied"): NextResponse {
  return errorResponse("FORBIDDEN", message);
}

/** 404 — covers both "missing" and "not visible to caller" (no oracle). */
export function notFound(message = "Resource not found"): NextResponse {
  return errorResponse("NOT_FOUND", message);
}

/** 400 — malformed query/path/body values. */
export function validationError(details: ApiErrorDetail[]): NextResponse {
  return errorResponse("VALIDATION_ERROR", "Invalid request parameters", details);
}

/**
 * 500 — generic only. The raw error must be logged server-side by the caller
 * via `console.error` and never passed here.
 */
export function internalError(): NextResponse {
  return errorResponse("INTERNAL_ERROR", "An unexpected error occurred");
}

/** 200 — success envelope with optional pagination metadata. */
export function success<T>(data: T, pagination?: PaginationMeta): NextResponse {
  return NextResponse.json(
    pagination === undefined
      ? { success: true, data }
      : { success: true, data, pagination },
    { status: 200 },
  );
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
}

export interface PaginationParseFailure {
  ok: false;
  details: ApiErrorDetail[];
}

export interface PaginationParseSuccess {
  ok: true;
  value: ParsedPagination;
}

/**
 * Parse `page` / `pageSize` (`limit` is accepted as a `pageSize` alias for
 * frontend compatibility). Returns validation details instead of throwing.
 *
 * - `page`: positive integer, default 1. Non-integer or < 1 → 400.
 * - `pageSize`: positive integer, default 20, clamped to 100.
 *   Non-integer or < 1 → 400.
 */
export function parsePagination(
  searchParams: URLSearchParams,
): PaginationParseSuccess | PaginationParseFailure {
  const details: ApiErrorDetail[] = [];

  const rawPage = searchParams.get("page");
  const rawPageSize =
    searchParams.get("pageSize") ?? searchParams.get("limit");

  let page = DEFAULT_PAGE;
  if (rawPage !== null && rawPage.trim() !== "") {
    if (!/^\d+$/.test(rawPage.trim())) {
      details.push({
        field: "page",
        message: "page must be a positive integer",
      });
    } else {
      page = Number.parseInt(rawPage.trim(), 10);
      if (page < 1) {
        details.push({
          field: "page",
          message: "page must be greater than or equal to 1",
        });
      }
    }
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawPageSize !== null && rawPageSize.trim() !== "") {
    if (!/^\d+$/.test(rawPageSize.trim())) {
      details.push({
        field: "pageSize",
        message: "pageSize must be a positive integer",
      });
    } else {
      const parsedSize = Number.parseInt(rawPageSize.trim(), 10);
      if (parsedSize < 1) {
        details.push({
          field: "pageSize",
          message: "pageSize must be greater than or equal to 1",
        });
      } else {
        pageSize = Math.min(parsedSize, MAX_PAGE_SIZE);
      }
    }
  }

  if (details.length > 0) {
    return { ok: false, details };
  }
  return { ok: true, value: { page, pageSize } };
}

/** Offset/limit pair derived from parsed pagination. */
export function toOffsetLimit(pagination: ParsedPagination): {
  offset: number;
  limit: number;
} {
  return {
    offset: (pagination.page - 1) * pagination.pageSize,
    limit: pagination.pageSize,
  };
}

export function buildPaginationMeta(
  pagination: ParsedPagination,
  total: number,
): PaginationMeta {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
  };
}

/**
 * Escape user input embedded in PostgREST `ilike.*…*` patterns so `%`, `_`,
 * `\\`, `,`, `(`, `)` cannot alter the intended match or break `or=` syntax.
 * The row scope still comes from RLS; this only keeps search literal.
 */
export function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}
