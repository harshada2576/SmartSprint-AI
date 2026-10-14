import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { isSprintAccessible } from "@/api/access";
import {
  internalErrorResponse,
  notFoundResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import { db } from "@supabase/client";
import { sprints, tasks, projects, users } from "@supabase/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedContext(req);
    if ("response" in auth) return auth.response;

    const { id: sprintId } = await params;
    if (!sprintId || !isUuid(sprintId)) {
      return validationErrorResponse([
        { field: "sprintId", message: "Sprint id must be a valid UUID" },
      ]);
    }

    // Scope probe (RLS): HR has zero project/report access; FINANCE/LEGAL
    // see member projects only. Missing and inaccessible share one 404.
    {
      const scope = await resolveRequestScope(auth.context.supabase, auth.context.user.id);
      void scope;
      if (!(await isSprintAccessible(auth.context.supabase, sprintId))) {
        return notFoundResponse("Sprint not found");
      }
    }

    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1);

    if (!sprint) {
      return notFoundResponse("Sprint not found");
    }

    // Fetch parent project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, sprint.projectId))
      .limit(1);

    // Fetch sprint tasks
    const sprintTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.sprintId, sprintId));

    // Developer names are resolved only for assignees on this sprint's
    // tasks (scoped lookup — never a full users-table scan).
    const assigneeIds = Array.from(
      new Set(
        sprintTasks
          .map((t) => t.assigneeId)
          .filter((id): id is string => typeof id === "string"),
      ),
    );
    const userMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const scopedUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(inArray(users.id, assigneeIds));
      for (const u of scopedUsers) {
        userMap.set(u.id, `${u.firstName} ${u.lastName}`.trim() || u.email);
      }
    }

    const plannedTasks = sprintTasks.length;
    const completedTasks = sprintTasks.filter(
      (t) => t.columnStatus === "done"
    ).length;
    const blockedTasks = sprintTasks.filter(
      (t) => t.isBlocked || t.columnStatus === "blocked"
    ).length;
    const incompleteTasks = plannedTasks - completedTasks;

    const plannedPoints = sprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const completedPoints = sprintTasks
      .filter((t) => t.columnStatus === "done")
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const velocity = completedPoints;
    const completionPercentage = plannedTasks > 0 ? Math.round((completedTasks / plannedTasks) * 100) : 0;

    // Developer contribution
    const devMap = new Map<string, { assigned: number; completed: number; points: number; hours: number }>();
    for (const t of sprintTasks) {
      if (t.assigneeId) {
        if (!devMap.has(t.assigneeId)) {
          devMap.set(t.assigneeId, { assigned: 0, completed: 0, points: 0, hours: 0 });
        }
        const stats = devMap.get(t.assigneeId)!;
        stats.assigned += 1;
        if (t.columnStatus === "done") {
          stats.completed += 1;
        }
        stats.points += t.points || 0;
        stats.hours += (Number(t.actualHours) || Number(t.estimatedHours) || 0);
      }
    }

    const developerContribution = Array.from(devMap.entries()).map(([userId, stats]) => ({
      userId,
      name: userMap.get(userId) || "Unknown Developer",
      assigned: stats.assigned,
      completed: stats.completed,
      points: stats.points,
      hours: stats.hours,
      contributionPercent: plannedPoints > 0 ? Math.round((stats.points / plannedPoints) * 100) : 0,
    }));

    const reportData = {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        capacityPoints: sprint.capacityPoints,
        capacityHours: sprint.capacityHours,
      },
      project: {
        id: project?.id,
        name: project?.name,
      },
      summary: {
        plannedTasks,
        completedTasks,
        incompleteTasks,
        blockedTasks,
        plannedPoints,
        completedPoints,
        velocity,
        completionPercentage,
      },
      developerContribution,
      tasks: sprintTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.columnStatus,
        priority: t.priority,
        points: t.points || 0,
        isBlocked: t.isBlocked,
        blockedReason: t.blockedReason,
        assignee: t.assigneeId ? userMap.get(t.assigneeId) : "Unassigned",
      })),
    };

    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      let csv = `SmartSprint AI - Sprint Report: ${sprint.name}\n`;
      csv += `Project,${project?.name || "Unknown"}\n`;
      csv += `Goal,"${(sprint.goal || "").replace(/"/g, '""')}"\n`;
      csv += `Dates,${sprint.startDate || "N/A"} to ${sprint.endDate || "N/A"}\n`;
      csv += `Status,${sprint.status}\n\n`;

      csv += `Metric,Value\n`;
      csv += `Planned Tasks,${plannedTasks}\n`;
      csv += `Completed Tasks,${completedTasks}\n`;
      csv += `Incomplete Tasks,${incompleteTasks}\n`;
      csv += `Blocked Tasks,${blockedTasks}\n`;
      csv += `Planned Points,${plannedPoints}\n`;
      csv += `Completed Points (Velocity),${velocity}\n`;
      csv += `Completion Percentage,${completionPercentage}%\n\n`;

      csv += "Developer Contribution\n";
      csv += "Developer,Assigned,Completed,Points,Hours,Contribution %\n";
      for (const dev of developerContribution) {
        csv += `"${dev.name}",${dev.assigned},${dev.completed},${dev.points},${dev.hours},${dev.contributionPercent}%\n`;
      }

      csv += "\nSprint Tasks\n";
      csv += "Title,Status,Priority,Points,Blocked,Blocked Reason,Assignee\n";
      for (const t of reportData.tasks) {
        csv += `"${t.title.replace(/"/g, '""')}",${t.status},${t.priority},${t.points},${t.isBlocked ? "YES" : "NO"},"${(t.blockedReason || "").replace(/"/g, '""')}","${t.assignee}"\n`;
      }

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sprint-report-${sprint.name.toLowerCase().replace(/\s+/g, "-")}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: reportData });
  } catch (error) {
    console.error("Sprint report error:", error);
    return internalErrorResponse();
  }
}
