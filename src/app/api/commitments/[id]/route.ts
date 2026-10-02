import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/api/auth";
import {
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import {
  editCommitment,
  getCommitment,
  removeCommitment,
} from "@/services/commitment.service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

  if (!id) {
    return validationErrorResponse([
      {
        field: "id",
        message: "Commitment id is required",
      },
    ]);
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

  if (!body || typeof body !== "object") {
    return validationErrorResponse([
      {
        field: "body",
        message: "Request body must be an object",
      },
    ]);
  }

  const data = body as Record<string, unknown>;

  try {
    const commitment = await editCommitment(
      auth.context.supabase,
      id,
      {
        ...(typeof data.title === "string"
          ? { title: data.title }
          : {}),
        ...(typeof data.description === "string" || data.description === null
          ? { description: data.description as string | null }
          : {}),
        ...(typeof data.commitment_type === "string"
          ? {
              commitment_type: data.commitment_type as
                | "outcome"
                | "deliverable"
                | "milestone"
                | "obligation",
            }
          : {}),
        ...(typeof data.status === "string"
          ? {
              status: data.status as
                | "planned"
                | "inProgress"
                | "completed"
                | "blocked",
            }
          : {}),
        ...(typeof data.due_date === "string" || data.due_date === null
          ? { due_date: data.due_date as string | null }
          : {}),
        ...(typeof data.progress === "number"
          ? { progress: data.progress }
          : {}),
        ...(typeof data.owner_id === "string" || data.owner_id === null
          ? { owner_id: data.owner_id as string | null }
          : {}),
      },
    );

    return successResponse(commitment);
  } catch (error) {
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

  if (!id) {
    return validationErrorResponse([
      {
        field: "id",
        message: "Commitment id is required",
      },
    ]);
  }

  try {
    const existing = await getCommitment(
      auth.context.supabase,
      id,
    );

    if (!existing) {
      return NextResponse.json(
        { error: "Commitment not found" },
        { status: 404 },
      );
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
    console.error("DELETE /api/commitments/[id] failed:", error);
    return internalErrorResponse();
  }
}