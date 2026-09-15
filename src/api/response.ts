import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: ApiErrorDetail[],
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export function unauthenticatedResponse(): NextResponse {
  return errorResponse("UNAUTHENTICATED", "Authentication required", 401);
}

export function forbiddenResponse(
  message = "Insufficient permissions",
): NextResponse {
  return errorResponse("FORBIDDEN", message, 403);
}

export function notFoundResponse(
  message = "Resource not found",
): NextResponse {
  return errorResponse("NOT_FOUND", message, 404);
}

export function validationErrorResponse(
  details: ApiErrorDetail[],
  message = "Invalid request parameters",
): NextResponse {
  return errorResponse("VALIDATION_ERROR", message, 400, details);
}

export function internalErrorResponse(): NextResponse {
  // Generic by design: never surface SQL errors, stack traces, credentials,
  // or service-role secrets. Details are logged server-side at the call site.
  return errorResponse("INTERNAL_ERROR", "Something went wrong", 500);
}

export function successResponse<T>(
  data: T,
  init?: { pagination?: unknown; meta?: unknown },
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
