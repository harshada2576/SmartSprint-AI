import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/api/auth";
import {
  createdResponse,
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import {
  addCommitment,
  getProjectCommitments,
} from "@/services/commitment.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/commitments?projectId=<project-id>
 *
 * Returns commitments visible to the authenticated caller.
 * PostgreSQL RLS enforces project/organization access.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let auth;

  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("GET /api/commitments auth failed:", error);
    return internalErrorResponse();
  }

  if (!auth.ok) {
    return auth.response;
  }

  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return validationErrorResponse([
      {
        field: "projectId",
        message: "projectId is required",
      },
    ]);
  }

  try {
    const commitments = await getProjectCommitments(
      auth.context.supabase,
      projectId,
    );

    return successResponse(commitments);
  } catch (error) {
    console.error("GET /api/commitments failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/commitments
 *
 * Creates a commitment.
 * Authorization is enforced by PostgreSQL RLS.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let auth;

  try {
    auth = await requireAuthenticatedContext(request);
  } catch (error) {
    console.error("POST /api/commitments auth failed:", error);
    return internalErrorResponse();
  }

  if (!auth.ok) {
    return auth.response;
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

  if (
    typeof data.project_id !== "string" ||
    !data.project_id.trim()
  ) {
    return validationErrorResponse([
      {
        field: "project_id",
        message: "project_id is required",
      },
    ]);
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    return validationErrorResponse([
      {
        field: "title",
        message: "title is required",
      },
    ]);
  }

  try {
    const commitment = await addCommitment(auth.context.supabase, {
      project_id: data.project_id,
      title: data.title,
      description:
        typeof data.description === "string"
          ? data.description
          : null,
      commitment_type:
        typeof data.commitment_type === "string"
          ? (data.commitment_type as
              | "outcome"
              | "deliverable"
              | "milestone"
              | "obligation")
          : "deliverable",
      status:
        typeof data.status === "string"
          ? (data.status as
              | "planned"
              | "inProgress"
              | "completed"
              | "blocked")
          : "planned",
      due_date:
        typeof data.due_date === "string"
          ? data.due_date
          : null,
      progress:
        typeof data.progress === "number"
          ? data.progress
          : 0,
      owner_id:
        typeof data.owner_id === "string"
          ? data.owner_id
          : null,
    });

    return createdResponse(commitment);
  } catch (error) {
    console.error("POST /api/commitments failed:", error);
    return internalErrorResponse();
  }
}