import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { sprints, tasks, projects, activityLogs, notifications } from "@supabase/schema";
import { eq, and } from "drizzle-orm";
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

    if (sprint.status === "active") {
      return NextResponse.json(
        { success: false, error: { message: "Sprint is already active" } },
        { status: 400 }
      );
    }

    if (sprint.status === "completed") {
      return NextResponse.json(
        { success: false, error: { message: "Completed sprint cannot be restarted" } },
        { status: 400 }
      );
    }

    // Set other active sprints in this project to completed or planning if needed
    await db
      .update(sprints)
      .set({ status: "active", updatedAt: new Date().toISOString() })
      .where(eq(sprints.id, sprintId));

    // Promote backlog tasks in this sprint to todo
    await db
      .update(tasks)
      .set({ columnStatus: "todo", updatedAt: new Date().toISOString() })
      .where(and(eq(tasks.sprintId, sprintId), eq(tasks.columnStatus, "backlog")));

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
      value: `Started sprint ${sprint.name}`,
    });

    // Notify assigned developers
    const assignedTasks = await db
      .select({ assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(eq(tasks.sprintId, sprintId));

    const uniqueAssignees = Array.from(
      new Set(assignedTasks.map((t) => t.assigneeId).filter(Boolean))
    ) as string[];

    for (const devId of uniqueAssignees) {
      await db.insert(notifications).values({
        userId: devId,
        type: "sprint",
        title: `Sprint ${sprint.name} Started`,
        description: `Sprint ${sprint.name} is now active. Check your assigned tasks on the Sprint Board.`,
        priority: "high",
      });
    }

    return successResponse({
      id: sprintId,
      name: sprint.name,
      status: "active",
      notifiedDevelopers: uniqueAssignees.length,
    });
  } catch (err) {
    console.error("POST /api/sprints/[id]/start error:", err);
    return internalErrorResponse();
  }
}
