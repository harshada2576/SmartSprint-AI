import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { sprints, tasks, projects, activityLogs, notifications } from "@supabase/schema";
import { eq, and, sql, ne } from "drizzle-orm";
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
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: sprintId } = await context.params;
    if (!isUuid(sprintId)) {
      return validationErrorResponse([{ field: "id", message: "Sprint id must be a valid UUID" }]);
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

    if (sprint.status === "completed") {
      return NextResponse.json(
        { success: false, error: { message: "Sprint is already completed" } },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const incompleteAction =
      body?.incompleteAction === "leave_unassigned"
        ? "leave_unassigned"
        : "move_to_backlog";

    // Analyze tasks in sprint before closing
    const sprintTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.sprintId, sprintId));

    const totalTasks = sprintTasks.length;
    const completedTasks = sprintTasks.filter((t) => t.columnStatus === "done");
    const incompleteTasks = sprintTasks.filter((t) => t.columnStatus !== "done");
    const blockedTasks = sprintTasks.filter((t) => t.isBlocked || t.columnStatus === "blocked");

    const plannedPoints = sprintTasks.reduce((acc, t) => acc + (t.points ?? 0), 0);
    const completedPoints = completedTasks.reduce((acc, t) => acc + (t.points ?? 0), 0);
    const completionRate = plannedPoints > 0 ? Math.round((completedPoints / plannedPoints) * 100) : 0;

    // Handle incomplete tasks
    if (incompleteTasks.length > 0) {
      if (incompleteAction === "move_to_backlog") {
        await db
          .update(tasks)
          .set({
            sprintId: null,
            columnStatus: "backlog",
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(tasks.sprintId, sprintId), ne(tasks.columnStatus, "done")));
      } else {
        await db
          .update(tasks)
          .set({
            sprintId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(tasks.sprintId, sprintId), ne(tasks.columnStatus, "done")));
      }
    }

    // Mark sprint completed
    await db
      .update(sprints)
      .set({
        status: "completed",
        totalPoints: plannedPoints,
        completedPoints,
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
      action: "completed",
      entityType: "sprint",
      entityId: sprintId,
      value: `Completed sprint ${sprint.name} (${completedTasks.length}/${totalTasks} tasks done, ${completionRate}%)`,
    });

    const summary = {
      sprintId,
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalTasks,
      completedTasksCount: completedTasks.length,
      incompleteTasksCount: incompleteTasks.length,
      blockedTasksCount: blockedTasks.length,
      plannedPoints,
      completedPoints,
      completionRate,
      incompleteActionHandled: incompleteAction,
    };

    return successResponse(summary);
  } catch (err) {
    console.error("POST /api/sprints/[id]/complete error:", err);
    return internalErrorResponse();
  }
}
