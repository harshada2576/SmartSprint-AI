import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { parsePagination } from "@/api/pagination";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
} from "@/api/response";
import { validateBacklogQuery } from "@/schemas/backlog-query";
import { listBacklogItems } from "@/repositories/backlog.repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/backlog — authenticated, project-scoped backlog listing.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { supabase } = auth.context;
    const searchParams = request.nextUrl.searchParams;

    const pagination = parsePagination(searchParams);

    if ("response" in pagination) {
      return pagination.response;
    }

    const validated = validateBacklogQuery(searchParams);

    if ("response" in validated) {
      return validated.response;
    }

    const { filters } = validated;

    if (filters.projectId) {
      const accessible = await isProjectAccessible(
        supabase,
        filters.projectId,
      );

      if (!accessible) {
        return forbiddenResponse();
      }
    }

    const result = await listBacklogItems(supabase, {
      projectId: filters.projectId,
      commitmentId: filters.commitmentId,
      status: filters.status,
      priority: filters.priority,
      search: filters.search,
      page: pagination.params.page,
      pageSize: pagination.params.pageSize,
    });

    return successResponse(result.items, {
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("GET /api/backlog failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/backlog
 *
 * Creates a backlog item from an existing requirement.
 *
 * Body:
 * {
 *   projectId: string,
 *   requirementId: string,
 *   commitmentId?: string | null
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { supabase } = auth.context;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = body as Record<string, unknown>;

    const projectId =
      typeof data.projectId === "string"
        ? data.projectId.trim()
        : "";

    const requirementId =
      typeof data.requirementId === "string"
        ? data.requirementId.trim()
        : "";

    const commitmentId =
      data.commitmentId === null ||
      data.commitmentId === undefined
        ? null
        : typeof data.commitmentId === "string"
          ? data.commitmentId.trim()
          : undefined;

    if (!projectId || !requirementId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "projectId and requirementId are required.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (
      commitmentId !== null &&
      (commitmentId === undefined ||
        commitmentId.length === 0)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "commitmentId must be a valid value or null.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const accessible = await isProjectAccessible(
      supabase,
      projectId,
    );

    if (!accessible) {
      return forbiddenResponse();
    }

    // Verify that the requirement belongs to this project.
    const {
      data: requirement,
      error: requirementError,
    } = await supabase
      .from("requirements")
      .select("id, project_id")
      .eq("id", requirementId)
      .maybeSingle();

    if (requirementError) {
      console.error(
        "POST /api/backlog requirement lookup failed:",
        requirementError,
      );
      return internalErrorResponse();
    }

    if (!requirement) {
      return notFoundResponse();
    }

    if (requirement.project_id !== projectId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "The requirement must belong to the selected project.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Prevent the same requirement from being added twice.
    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from("backlog")
      .select("id")
      .eq("requirement_id", requirementId)
      .maybeSingle();

    if (existingError) {
      console.error(
        "POST /api/backlog duplicate check failed:",
        existingError,
      );
      return internalErrorResponse();
    }

    if (existing) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "This requirement is already in the backlog.",
          },
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // If a commitment is supplied, verify that it belongs
    // to the same project.
    if (commitmentId !== null) {
      const {
        data: commitment,
        error: commitmentError,
      } = await supabase
        .from("commitments")
        .select("id, project_id")
        .eq("id", commitmentId)
        .maybeSingle();

      if (commitmentError) {
        console.error(
          "POST /api/backlog commitment lookup failed:",
          commitmentError,
        );
        return internalErrorResponse();
      }

      if (!commitment) {
        return notFoundResponse();
      }

      if (commitment.project_id !== projectId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "The commitment must belong to the same project.",
            },
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    // Put the new item at the end of the current backlog.
    const {
      data: lastItem,
      error: lastItemError,
    } = await supabase
      .from("backlog")
      .select("rank")
      .eq("project_id", projectId)
      .order("rank", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastItemError) {
      console.error(
        "POST /api/backlog rank lookup failed:",
        lastItemError,
      );
      return internalErrorResponse();
    }

    const nextRank = (lastItem?.rank ?? 0) + 1;

    const {
      data: created,
      error: createError,
    } = await supabase
      .from("backlog")
      .insert({
        project_id: projectId,
        requirement_id: requirementId,
        commitment_id: commitmentId,
        rank: nextRank,
      })
      .select(
        "id,project_id,requirement_id,commitment_id,rank,created_at",
      )
      .single();

    if (createError) {
      console.error(
        "POST /api/backlog create failed:",
        createError,
      );
      return internalErrorResponse();
    }

    return successResponse(created);
  } catch (error) {
    console.error(
      "POST /api/backlog failed:",
      error,
    );
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/backlog
 *
 * Links or unlinks a backlog item from a project commitment.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { supabase } = auth.context;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON body.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = body as Record<string, unknown>;

    const backlogId =
      typeof data.backlogId === "string"
        ? data.backlogId.trim()
        : "";

    const commitmentId =
      data.commitmentId === null
        ? null
        : typeof data.commitmentId === "string"
          ? data.commitmentId.trim()
          : undefined;

    if (!backlogId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "backlogId is required.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (
      commitmentId !== null &&
      (commitmentId === undefined ||
        commitmentId.length === 0)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "commitmentId must be a valid value or null.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const {
      data: backlogItem,
      error: backlogError,
    } = await supabase
      .from("backlog")
      .select("id, project_id, requirement_id")
      .eq("id", backlogId)
      .maybeSingle();

    if (backlogError) {
      console.error(
        "PATCH /api/backlog backlog lookup failed:",
        backlogError,
      );
      return internalErrorResponse();
    }

    if (!backlogItem) {
      return notFoundResponse();
    }

    const accessible = await isProjectAccessible(
      supabase,
      backlogItem.project_id,
    );

    if (!accessible) {
      return forbiddenResponse();
    }

    if (commitmentId !== null) {
      const {
        data: commitment,
        error: commitmentError,
      } = await supabase
        .from("commitments")
        .select("id, project_id")
        .eq("id", commitmentId)
        .maybeSingle();

      if (commitmentError) {
        console.error(
          "PATCH /api/backlog commitment lookup failed:",
          commitmentError,
        );
        return internalErrorResponse();
      }

      if (!commitment) {
        return notFoundResponse();
      }

      if (
        commitment.project_id !==
        backlogItem.project_id
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "The commitment must belong to the same project as the backlog item.",
            },
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("backlog")
      .update({
        commitment_id: commitmentId,
      })
      .eq("id", backlogId)
      .select(
        "id,project_id,requirement_id,commitment_id,rank,created_at",
      )
      .single();

    if (updateError) {
      console.error(
        "PATCH /api/backlog update failed:",
        updateError,
      );
      return internalErrorResponse();
    }

    return successResponse(updated);
  } catch (error) {
    console.error(
      "PATCH /api/backlog failed:",
      error,
    );
    return internalErrorResponse();
  }
}