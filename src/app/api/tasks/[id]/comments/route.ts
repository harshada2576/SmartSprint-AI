import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { taskComments, tasks, users, activityLogs, notifications, projects } from "@supabase/schema";
import { eq, asc } from "drizzle-orm";
import { isUuid } from "@/schemas/query-params";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { getTaskById } from "@/services/task.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([{ field: "id", message: "Task id must be a valid UUID" }]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const task = await getTaskById(supabase, scope, taskId);
    if (!task) {
      return notFoundResponse("Task not found");
    }

    const comments = await db
      .select({
        id: taskComments.id,
        taskId: taskComments.taskId,
        userId: taskComments.userId,
        content: taskComments.content,
        createdAt: taskComments.createdAt,
        updatedAt: taskComments.updatedAt,
        authorName: users.firstName,
        authorLastName: users.lastName,
        authorEmail: users.email,
        authorInitials: users.avatarInitials,
      })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.userId))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt));

    return successResponse(comments);
  } catch (err) {
    console.error("GET /api/tasks/[id]/comments error:", err);
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([{ field: "id", message: "Task id must be a valid UUID" }]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const task = await getTaskById(supabase, scope, taskId);
    if (!task) {
      return notFoundResponse("Task not found");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([{ field: "body", message: "Request body must be a JSON object" }]);
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return validationErrorResponse([{ field: "content", message: "Comment content cannot be empty" }]);
    }
    if (content.length > 5000) {
      return validationErrorResponse([{ field: "content", message: "Comment exceeds 5000 characters limit" }]);
    }

    const [created] = await db
      .insert(taskComments)
      .values({
        taskId,
        userId: user.id,
        content,
      })
      .returning();

    // Fetch author details
    const [author] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarInitials: users.avatarInitials,
      })
      .from(users)
      .where(eq(users.id, user.id));

    // Get project organization for logging
    const [proj] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, task.project_id));

    // Activity log
    await db.insert(activityLogs).values({
      organizationId: proj?.organizationId,
      projectId: task.project_id,
      userId: user.id,
      action: "commented",
      entityType: "task",
      entityId: taskId,
      value: `Commented on ${task.display_id}`,
    });

    // Notify assignee if someone else commented
    if (task.assignee_id && task.assignee_id !== user.id) {
      await db.insert(notifications).values({
        userId: task.assignee_id,
        type: "task",
        title: `New comment on ${task.display_id}`,
        description: content.length > 80 ? `${content.slice(0, 77)}...` : content,
        priority: "medium",
      });
    }

    return successResponse({
      ...created,
      authorName: author?.firstName ?? "User",
      authorLastName: author?.lastName ?? "",
      authorEmail: author?.email ?? "",
      authorInitials: author?.avatarInitials ?? "U",
    });
  } catch (err) {
    console.error("POST /api/tasks/[id]/comments error:", err);
    return internalErrorResponse();
  }
}
