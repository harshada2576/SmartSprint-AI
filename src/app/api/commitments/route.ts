import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedContext } from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import {
  createdResponse,
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import {
  parseCommitmentCreateBody,
  validateCommitmentsQuery,
} from "@/schemas/commitment-mutations";
import {
  addCommitment,
  getProjectCommitments,
} from "@/services/commitment.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/commitments?projectId=<project-id>
 *
 * Returns commitments visible to the authenticated caller.
 * The explicit project probe answers 403 for foreign/missing projects
 * (no existence oracle); PostgreSQL RLS remains the final authority.
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

  const validated = validateCommitmentsQuery(request.nextUrl.searchParams);

  if ("response" in validated) {
    return validated.response;
  }

  try {
    const accessible = await isProjectAccessible(
      auth.context.supabase,
      validated.projectId,
    );

    if (!accessible) {
      return forbiddenResponse();
    }

    const commitments = await getProjectCommitments(
      auth.context.supabase,
      validated.projectId,
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
 * Creates a commitment. Body validation rejects unknown enum values,
 * out-of-range progress, and malformed dates/UUIDs with 400 before any
 * database write. Authorization is enforced by the project probe plus
 * PostgreSQL RLS (`commitments_insert_staff`); RLS denials map to 403.
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

  const parsed = parseCommitmentCreateBody(body);

  if (!parsed.ok) {
    return validationErrorResponse(parsed.details);
  }

  try {
    const accessible = await isProjectAccessible(
      auth.context.supabase,
      parsed.value.project_id,
    );

    if (!accessible) {
      return forbiddenResponse();
    }

    const commitment = await addCommitment(
      auth.context.supabase,
      parsed.value,
    );

    return createdResponse(commitment);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") {
      return forbiddenResponse();
    }
    console.error("POST /api/commitments failed:", error);
    return internalErrorResponse();
  }
}
