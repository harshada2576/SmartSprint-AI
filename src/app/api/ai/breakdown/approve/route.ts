import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { projects, requirements, tasks, sprints, activityLogs } from "@supabase/schema";
import { eq } from "drizzle-orm";
import { isUuid } from "@/schemas/query-params";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { mayApproveBreakdown } from "@/services/rbac";
import { isProjectAccessible } from "@/api/access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (!scope.isStaffAnywhere) {
      return forbiddenResponse("Only Project Managers and Administrators can approve and create AI project plans.");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([{ field: "body", message: "Request body must be a JSON object" }]);
    }

    let targetProjectId = typeof body.projectId === "string" && isUuid(body.projectId) ? body.projectId : null;
    let targetOrgId = scope.primaryOrganizationId || scope.organizationIds[0];

    // Target-org staff check (defense-in-depth): the caller must be
    // ADMIN / PROJECT_MANAGER in the organization owning the target
    // project (or the creation org). DEVELOPER / FINANCE / LEGAL / HR
    // receive 403 even when calling this endpoint directly.
    if (targetProjectId) {
      if (!(await isProjectAccessible(supabase, targetProjectId))) {
        return notFoundResponse("Target project not found");
      }
      const [proj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, targetProjectId))
        .limit(1);

      if (!proj) {
        return notFoundResponse("Target project not found");
      }
      targetOrgId = proj.organizationId;
    } else {
      // Create new project if none provided
      const projectName = typeof body.projectName === "string" && body.projectName.trim()
        ? body.projectName.trim()
        : "Online Food Delivery Platform";

      const projectDesc = typeof body.projectDescription === "string" ? body.projectDescription.trim() : null;

      const [newProj] = await db
        .insert(projects)
        .values({
          organizationId: targetOrgId,
          name: projectName,
          description: projectDesc,
          status: "active",
          priority: "high",
          method: "scrum",
          managerId: user.id,
          startDate: new Date().toISOString().slice(0, 10),
        })
        .returning();

      targetProjectId = newProj.id;
    }

    const targetRole = targetOrgId ? scope.rolesByOrg[targetOrgId] : undefined;
    if (!mayApproveBreakdown(targetRole)) {
      return forbiddenResponse("Only Project Managers and Administrators can approve and create AI project plans.");
    }

    const epics = Array.isArray(body.epics) ? body.epics : [];
    if (epics.length === 0) {
      return validationErrorResponse([{ field: "epics", message: "Plan must contain at least one epic" }]);
    }

    const createdTaskRows: Array<{ id: string; points: number; estimatedHours: number }> = [];
    let requirementsCount = 0;

    // 1. Create Requirements (Epics) & Tasks
    for (const epic of epics) {
      const epicName = typeof epic.name === "string" ? epic.name.trim() : "Feature Epic";
      const epicDesc = typeof epic.description === "string" ? epic.description.trim() : null;

      const reqNum = requirementsCount + 1;
      const displayId = `REQ-${reqNum.toString().padStart(3, "0")}`;

      const [createdReq] = await db
        .insert(requirements)
        .values({
          projectId: targetProjectId,
          displayId,
          title: epicName,
          description: epicDesc,
          category: "feature",
          status: "draft",
          priority: "high",
        })
        .returning();

      requirementsCount += 1;

      const epicTasks = Array.isArray(epic.tasks) ? epic.tasks : [];
      for (const t of epicTasks) {
        const title = typeof t.title === "string" ? t.title.trim() : "Task";
        const description = typeof t.description === "string" ? t.description.trim() : "";
        const rawPriority = String(t.priority).toLowerCase();
        const priority: "low" | "medium" | "high" = rawPriority === "critical" || rawPriority === "high" ? "high" : rawPriority === "low" ? "low" : "medium";
        const estimatedHours = typeof t.estimatedHours === "number" && t.estimatedHours > 0 ? t.estimatedHours : 8;
        const points = Math.max(1, Math.round(estimatedHours / 2));

        // Generate sequential display ID
        const taskNum = createdTaskRows.length + 1;
        const taskDisplayId = `TSK-${taskNum.toString().padStart(3, "0")}`;

        const [createdTask] = await db
          .insert(tasks)
          .values({
            projectId: targetProjectId,
            requirementId: createdReq.id,
            displayId: taskDisplayId,
            title,
            description,
            priority,
            estimatedHours: String(estimatedHours),
            points,
            columnStatus: "backlog",
            progressPercent: 0,
            isBlocked: false,
          })
          .returning();

        createdTaskRows.push({
          id: createdTask.id,
          points,
          estimatedHours,
        });
      }
    }

    // 2. Create Suggested Sprints & Link Tasks
    const suggestedSprints = Array.isArray(body.suggestedSprints) ? body.suggestedSprints : [];
    let sprintsCount = 0;

    for (let i = 0; i < suggestedSprints.length; i++) {
      const s = suggestedSprints[i];
      const sprintName = typeof s.name === "string" ? s.name.trim() : `Sprint ${i + 1}`;
      const sprintGoal = typeof s.goal === "string" ? s.goal.trim() : null;
      const taskIndexes = Array.isArray(s.taskIndexes) ? s.taskIndexes : [];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + i * 14);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14);

      const [createdSprint] = await db
        .insert(sprints)
        .values({
          projectId: targetProjectId,
          name: sprintName,
          goal: sprintGoal,
          status: "planning",
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          capacityPoints: 30,
          capacityHours: 60,
          createdBy: user.id,
        })
        .returning();

      sprintsCount += 1;

      // Assign tasks to this sprint
      for (const idx of taskIndexes) {
        if (typeof idx === "number" && createdTaskRows[idx]) {
          const taskToAssign = createdTaskRows[idx];
          await db
            .update(tasks)
            .set({
              sprintId: createdSprint.id,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(tasks.id, taskToAssign.id));
        }
      }
    }

    // 3. Log Activity
    await db.insert(activityLogs).values({
      organizationId: targetOrgId,
      projectId: targetProjectId,
      userId: user.id,
      action: "created",
      entityType: "project",
      entityId: targetProjectId,
      value: `Approved and created AI plan: ${requirementsCount} epics, ${createdTaskRows.length} tasks, and ${sprintsCount} sprints.`,
    });

    return successResponse({
      projectId: targetProjectId,
      requirementsCreated: requirementsCount,
      tasksCreated: createdTaskRows.length,
      sprintsCreated: sprintsCount,
    });
  } catch (error) {
    console.error("POST /api/ai/breakdown/approve failed:", error);
    return internalErrorResponse();
  }
}
