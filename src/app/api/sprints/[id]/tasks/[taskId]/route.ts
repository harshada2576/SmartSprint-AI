import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { sprints, tasks, projects, activityLogs } from "@supabase/schema";
import { eq, and, sql } from "drizzle-orm";
import { isUuid } from "@/schemas/query-params";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: sprintId, taskId } = await context.params;
    if (!isUuid(sprintId) || !isUuid(taskId)) {
      return validationErrorResponse([
        { field: "ids", message: "sprintId and taskId must be valid UUIDs" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    if (!scope.isStaffAnywhere) {
      return forbiddenResponse();
    }

    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1);

    if (!sprint) {
      return notFoundResponse("Sprint not found");
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return notFoundResponse("Task not found");
    }

    // Remove task from sprint
    const [updatedTask] = await db
      .update(tasks)
      .set({
        sprintId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    // Recalculate sprint points
    const [pointsResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(points), 0)::int`,
        completed: sql<number>`COALESCE(SUM(CASE WHEN column_status = 'done' THEN points ELSE 0 END), 0)::int`,
      })
      .from(tasks)
      .where(eq(tasks.sprintId, sprintId));

    await db
      .update(sprints)
      .set({
        totalPoints: pointsResult?.total ?? 0,
        completedPoints: pointsResult?.completed ?? 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sprints.id, sprintId));

    // Get project organization for logging
    const [proj] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, sprint.projectId));

    // Log activity
    await db.insert(activityLogs).values({
      organizationId: proj?.organizationId,
      projectId: sprint.projectId,
      userId: user.id,
      action: "updated",
      entityType: "sprint",
      entityId: sprintId,
      value: `Removed task ${task.displayId} from ${sprint.name}`,
    });

    return successResponse({
      task: updatedTask,
      sprintPoints: pointsResult,
    });
  } catch (err) {
    console.error("DELETE /api/sprints/[id]/tasks/[taskId] error:", err);
    return internalErrorResponse();
  }
}
