import type { NextResponse } from "next/server";
import { validationErrorResponse } from "./response";

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

function parsePositiveInt(
  raw: string | null,
  field: string,
): { value?: number; error?: { field: string; message: string } } {
  if (raw === null || raw.trim() === "") {
    return {};
  }
  if (!/^\d+$/.test(raw.trim())) {
    return {
      error: {
        field,
        message: `Query parameter "${field}" must be a positive integer`,
      },
    };
  }
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    return {
      error: {
        field,
        message: `Query parameter "${field}" must be a positive integer`,
      },
    };
  }
  return { value };
}

/**
 * Parses `?page=` / `?pageSize=` with safe defaults (page 1, 20 per page).
 * `pageSize` is clamped to a safe maximum; non-numeric or out-of-range
 * values are rejected with a VALIDATION_ERROR response.
 */
export function parsePagination(
  searchParams: URLSearchParams,
): PaginationResult {
  const pageParsed = parsePositiveInt(searchParams.get("page"), "page");
  if (pageParsed.error) {
    return { response: validationErrorResponse([pageParsed.error]) };
  }
  const sizeParsed = parsePositiveInt(
    searchParams.get("pageSize"),
    "pageSize",
  );
  if (sizeParsed.error) {
    return { response: validationErrorResponse([sizeParsed.error]) };
  }

  let pageSize = sizeParsed.value ?? DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) {
    pageSize = MAX_PAGE_SIZE;
  }

  return {
    params: {
      page: pageParsed.value ?? DEFAULT_PAGE,
      pageSize,
    },
  };
}
