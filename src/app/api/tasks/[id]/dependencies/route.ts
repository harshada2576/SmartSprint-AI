import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import {
  createdResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStaffRole(role: string | undefined): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

async function getTaskProjectId(
  supabase: Parameters<typeof isProjectAccessible>[0],
  taskId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,project_id")
    .eq("id", taskId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || typeof (data as { project_id?: unknown }).project_id !== "string") {
    return null;
  }
  return (data as { project_id: string }).project_id;
}

/**
 * GET /api/tasks/[id]/dependencies — list dependency edges for a task.
 * Readable by anyone with project visibility (staff + project members).
 * HR has no project visibility and receives 404 (no oracle).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([
        { field: "id", message: "Task id must be a valid UUID" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const projectId = await getTaskProjectId(supabase, taskId);
    if (!projectId || !(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Task not found");
    }
    void scope;

    const { data, error } = await supabase
      .from("task_dependencies")
      .select("id,task_id,depends_on_task_id,type,created_at")
      .or(`task_id.eq.${taskId},depends_on_task_id.eq.${taskId}`)
      .limit(100);
    if (error) throw error;
    return successResponse(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("GET /api/tasks/[id]/dependencies failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/tasks/[id]/dependencies — create one dependency edge.
 * Staff (ADMIN / PROJECT_MANAGER in the task's organization) only.
 * Rejects self-dependencies and cross-project edges with 400; the
 * database trigger re-enforces both for every lane.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([
        { field: "id", message: "Task id must be a valid UUID" },
      ]);
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }
    const dependsOnTaskId =
      typeof body.dependsOnTaskId === "string"
        ? body.dependsOnTaskId.trim()
        : "";
    if (!isUuid(dependsOnTaskId)) {
      return validationErrorResponse([
        {
          field: "dependsOnTaskId",
          message: "dependsOnTaskId must be a valid UUID",
        },
      ]);
    }
    const type =
      body.type === "is_blocked_by" || body.type === "blocks"
        ? body.type
        : "blocks";
    if (dependsOnTaskId === taskId) {
      return validationErrorResponse([
        { field: "dependsOnTaskId", message: "A task cannot depend on itself" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const projectId = await getTaskProjectId(supabase, taskId);
    if (!projectId || !(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Task not found");
    }

    // Resolve the task's organization through the project row.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", projectId)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const organizationId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!organizationId || !isStaffRole(scope.rolesByOrg[organizationId])) {
      return forbiddenResponse(
        "Only Project Managers and Administrators can manage task dependencies",
      );
    }

    // The dependency target must live in the same project.
    const dependsProjectId = await getTaskProjectId(supabase, dependsOnTaskId);
    if (!dependsProjectId) {
      return validationErrorResponse([
        {
          field: "dependsOnTaskId",
          message: "Dependency target task was not found",
        },
      ]);
    }
    if (dependsProjectId !== projectId) {
      return validationErrorResponse([
        {
          field: "dependsOnTaskId",
          message: "Dependencies must link tasks in the same project",
        },
      ]);
    }

    const { data: created, error: insertError } = await supabase
      .from("task_dependencies")
      .insert({
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        type,
        created_by: user.id,
      })
      .select("id,task_id,depends_on_task_id,type,created_at")
      .single();
    if (insertError) {
      const message = String(
        (insertError as { message?: string }).message ?? "",
      ).toLowerCase();
      if (message.includes("duplicate") || message.includes("unique")) {
        return validationErrorResponse([
          { field: "dependsOnTaskId", message: "Dependency already exists" },
        ]);
      }
      if (
        message.includes("row-level security") ||
        message.includes("policy") ||
        (insertError as { code?: string }).code === "42501"
      ) {
        return forbiddenResponse();
      }
      if (message.includes("itself") || message.includes("same project")) {
        return validationErrorResponse([
          { field: "dependsOnTaskId", message: "Invalid dependency edge" },
        ]);
      }
      throw insertError;
    }
    return createdResponse(created);
  } catch (error) {
    console.error("POST /api/tasks/[id]/dependencies failed:", error);
    return internalErrorResponse();
  }
}

/**
 * DELETE /api/tasks/[id]/dependencies — remove one edge.
 * Staff only. Body: `{ "dependencyId": "<uuid>" }`.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([
        { field: "id", message: "Task id must be a valid UUID" },
      ]);
    }
    const body = await request.json().catch(() => null);
    const dependencyId =
      isRecord(body) && typeof body.dependencyId === "string"
        ? body.dependencyId.trim()
        : "";
    if (!isUuid(dependencyId)) {
      return validationErrorResponse([
        { field: "dependencyId", message: "dependencyId must be a valid UUID" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const projectId = await getTaskProjectId(supabase, taskId);
    if (!projectId || !(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Task not found");
    }
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", projectId)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    const organizationId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!organizationId || !isStaffRole(scope.rolesByOrg[organizationId])) {
      return forbiddenResponse(
        "Only Project Managers and Administrators can manage task dependencies",
      );
    }

    const { data, error } = await supabase
      .from("task_dependencies")
      .delete()
      .eq("id", dependencyId)
      .eq("task_id", taskId)
      .select("id");
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      return notFoundResponse("Dependency not found");
    }
    return successResponse({ id: dependencyId, deleted: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id]/dependencies failed:", error);
    return internalErrorResponse();
  }
}
