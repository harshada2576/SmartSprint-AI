import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/api/auth";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import { parseCommitmentUpdateBody } from "@/schemas/commitment-mutations";
import {
  editCommitment,
  getCommitment,
  removeCommitment,
} from "@/services/commitment.service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidIdResponse(): NextResponse {
  return validationErrorResponse([
    {
      field: "id",
      message: "Commitment id must be a valid UUID",
    },
  ]);
}

/**
 * GET /api/commitments/[id]
 *
 * Returns a single commitment visible to the authenticated caller.
 * Missing rows and rows outside the caller's scope share the same
 * 404 answer (no existence oracle); RLS remains the final authority.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;

  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/commitments/[id] auth failed:", error);
    return internalErrorResponse();
  }

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return invalidIdResponse();
  }

  try {
    const commitment = await getCommitment(auth.context.supabase, id);

    if (!commitment) {
      return notFoundResponse("Commitment not found");
    }

    return successResponse(commitment);
  } catch (error) {
    console.error("GET /api/commitments/[id] failed:", error);
    return internalErrorResponse();
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;

  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("PUT /api/commitments/[id] auth failed:", error);
    return internalErrorResponse();
  }

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return invalidIdResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return validationErrorResponse([
      {
        field: "body",
        message: "Request body must be valid JSON",
      },
    ]);
  }

  const parsed = parseCommitmentUpdateBody(body);

  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  // Commitments never move projects: reject the attempt explicitly
  // instead of silently ignoring it.
  if (parsed.value.projectIdAttempt !== undefined) {
    return validationErrorResponse([
      {
        field: "project_id",
        message: "Commitments cannot be moved between projects",
      },
    ]);
  }

  try {
    const existing = await getCommitment(auth.context.supabase, id);

    if (!existing) {
      return notFoundResponse("Commitment not found");
    }

    const { projectIdAttempt: _ignored, ...updates } = parsed.value;

    const commitment = await editCommitment(
      auth.context.supabase,
      id,
      updates,
    );

    return successResponse(commitment);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      return forbiddenResponse();
    }
    console.error("PUT /api/commitments/[id] failed:", error);
    return internalErrorResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  let auth;

  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("DELETE /api/commitments/[id] auth failed:", error);
    return internalErrorResponse();
  }

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return invalidIdResponse();
  }

  try {
    const existing = await getCommitment(
      auth.context.supabase,
      id,
    );

    if (!existing) {
      return notFoundResponse("Commitment not found");
    }

    await removeCommitment(
      auth.context.supabase,
      id,
    );

    return successResponse({
      id,
      deleted: true,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      return forbiddenResponse();
    }
    console.error("DELETE /api/commitments/[id] failed:", error);
    return internalErrorResponse();
  }
}
