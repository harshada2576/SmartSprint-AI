import type { NextResponse } from "next/server";
import type { ApiErrorDetail, PaginationMeta } from "@/types/api";
import { validationErrorResponse } from "./response";

/**
 * Canonical backend API pagination + collection helpers.
 *
 * Ownership: Backend/API agent (`src/api/**`).
 *
 * Rules enforced here:
 * - Pagination uses `?page=1&pageSize=20` (`limit` accepted as a `pageSize`
 *   alias for frontend compatibility). `pageSize` is clamped to a maximum of
 *   100. Collections never return unbounded results.
 * - `parsePaginationParams` is the pure core returning validation details so
 *   schema parsers can aggregate pagination errors with other filter errors.
 *   `parsePagination` is the thin route-level wrapper returning a ready-made
 *   VALIDATION_ERROR response for routes without additional query filters.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export type PaginationResult =
  | { params: PaginationParams }
  | { response: NextResponse };

export interface PaginationParseSuccess {
  ok: true;
  value: PaginationParams;
}

export interface PaginationParseFailure {
  ok: false;
  details: ApiErrorDetail[];
}

/**
 * Parse `page` / `pageSize` (`limit` is accepted as a `pageSize` alias for
 * frontend compatibility). Returns validation details instead of throwing.
 *
 * - `page`: positive integer, default 1. Non-integer or < 1 → 400.
 * - `pageSize`: positive integer, default 20, clamped to 100.
 *   Non-integer or < 1 → 400.
 */
export function parsePaginationParams(
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

/**
 * Route-level pagination parsing with safe defaults (page 1, 20 per page).
 * `pageSize` is clamped to a safe maximum; non-numeric or out-of-range
 * values are rejected with a VALIDATION_ERROR response.
 */
export function parsePagination(
  searchParams: URLSearchParams,
): PaginationResult {
  const parsed = parsePaginationParams(searchParams);
  if (!parsed.ok) {
    return { response: validationErrorResponse(parsed.details) };
  }
  return { params: parsed.value };
}

/** Offset/limit pair derived from parsed pagination. */
export function toOffsetLimit(pagination: PaginationParams): {
  offset: number;
  limit: number;
} {
  return {
    offset: (pagination.page - 1) * pagination.pageSize,
    limit: pagination.pageSize,
  };
}

export function buildPaginationMeta(
  pagination: PaginationParams,
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
 * `\`, `,`, `(`, `)` cannot alter the intended match or break `or=` syntax.
 * The row scope still comes from RLS; this only keeps search literal.
 */
export function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}
