import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { generateProjectBreakdown } from "../../../../../ai/services/llm.client";
import { forbiddenResponse, internalErrorResponse, successResponse, validationErrorResponse } from "@/api/response";
import { mayGenerateBreakdown } from "@/services/rbac";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    // Matrix: ADMIN + PM may generate; DEVELOPER may view/use; FINANCE,
    // LEGAL, and HR cannot generate AI breakdowns.
    if (!Object.values(scope.rolesByOrg).some((role) => mayGenerateBreakdown(role))) {
      return forbiddenResponse("Your role cannot generate AI project breakdowns.");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([{ field: "body", message: "Request body must be a valid JSON object" }]);
    }

    const projectBrief = typeof body.projectBrief === "string" ? body.projectBrief.trim() : "";
    if (!projectBrief || projectBrief.length < 5) {
      return validationErrorResponse([
        { field: "projectBrief", message: "Project brief must be at least 5 characters long" },
      ]);
    }

    const breakdown = await generateProjectBreakdown(projectBrief);

    return successResponse(breakdown);
  } catch (error) {
    console.error("POST /api/ai/breakdown failed:", error);
    return internalErrorResponse();
  }
}
