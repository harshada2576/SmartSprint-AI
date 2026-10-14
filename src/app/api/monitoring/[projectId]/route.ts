import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { projects, sprints, tasks, risks, activityLogs, users } from "@supabase/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { isUuid } from "@/schemas/query-params";
import { isProjectAccessible } from "@/api/access";
import { internalErrorResponse, notFoundResponse, successResponse, validationErrorResponse } from "@/api/response";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { projectId } = await context.params;
    if (!isUuid(projectId)) {
      return validationErrorResponse([{ field: "projectId", message: "projectId must be a valid UUID" }]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.organizationIds.length === 0) {
      return notFoundResponse("Project not found");
    }

    // RLS visibility probe: HR has zero project access and FINANCE/LEGAL
    // see member projects only. Missing and inaccessible share one 404.
    if (!(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Project not found");
    }

    // 1. Fetch Project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || !scope.organizationIds.includes(project.organizationId)) {
      return notFoundResponse("Project not found");
    }

    // 2. Fetch Tasks
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((t) => t.columnStatus === "done");
    const inProgressTasks = projectTasks.filter((t) => t.columnStatus === "inProgress");
    const todoTasks = projectTasks.filter((t) => t.columnStatus === "todo" || t.columnStatus === "backlog");

    const now = new Date();
    const overdueTasks = projectTasks.filter((t) => {
      if (t.columnStatus === "done" || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      return !Number.isNaN(due.getTime()) && due < now;
    });
    const blockedTasks = projectTasks.filter((t) => t.isBlocked || t.columnStatus === "blocked");

    // 3. Fetch Active Sprint
    const [activeSprint] = await db
      .select()
      .from(sprints)
      .where(and(eq(sprints.projectId, projectId), eq(sprints.status, "active")))
      .limit(1);

    let sprintData = null;
    if (activeSprint) {
      const sprintTasks = projectTasks.filter((t) => t.sprintId === activeSprint.id);
      const sprintDone = sprintTasks.filter((t) => t.columnStatus === "done");
      const totalPts = sprintTasks.reduce((s, t) => s + (t.points || 0), 0);
      const donePts = sprintDone.reduce((s, t) => s + (t.points || 0), 0);
      const endTime = activeSprint.endDate
        ? new Date(activeSprint.endDate).getTime()
        : Number.NaN;
      const daysRemaining = Number.isNaN(endTime)
        ? null
        : Math.max(0, Math.ceil((endTime - now.getTime()) / (1000 * 60 * 60 * 24)));

      sprintData = {
        id: activeSprint.id,
        name: activeSprint.name,
        goal: activeSprint.goal,
        startDate: activeSprint.startDate,
        endDate: activeSprint.endDate,
        daysRemaining,
        totalPoints: totalPts,
        completedPoints: donePts,
        progressPercent: totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0,
        tasksCount: sprintTasks.length,
        doneCount: sprintDone.length,
        // Aliases consumed by /monitoring (points- and count-based cells).
        capacityPoints: totalPts,
        usedPoints: donePts,
        totalTasks: sprintTasks.length,
        completedTasks: sprintDone.length,
      };
    }

    // 4. Fetch Risks
    const projectRisks = await db
      .select()
      .from(risks)
      .where(and(eq(risks.projectId, projectId), eq(risks.status, "open")));

    const highRisks = projectRisks.filter((r) => r.impact === "high" || r.probability === "high");

    // 5. Developer Workload
    const assigneeIds = Array.from(new Set(projectTasks.map((t) => t.assigneeId).filter(Boolean))) as string[];
    const assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const devList = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, assigneeIds));
      for (const d of devList) {
        assigneeMap.set(d.id, `${d.firstName} ${d.lastName}`.trim());
      }
    }

    const devTasksMap = new Map<string, { assigned: number; inProgress: number; completed: number; estimatedHours: number }>();
    for (const t of projectTasks) {
      if (!t.assigneeId) continue;
      const stat = devTasksMap.get(t.assigneeId) || { assigned: 0, inProgress: 0, completed: 0, estimatedHours: 0 };
      stat.assigned += 1;
      if (t.columnStatus === "done") stat.completed += 1;
      else if (t.columnStatus === "inProgress") stat.inProgress += 1;
      if (t.columnStatus !== "done") {
        const hours = typeof t.estimatedHours === "string" ? Number.parseFloat(t.estimatedHours) : (t.estimatedHours ?? 0);
        if (Number.isFinite(hours)) stat.estimatedHours += hours;
      }
      devTasksMap.set(t.assigneeId, stat);
    }

    const workload = Array.from(devTasksMap.entries()).map(([userId, stats]) => ({
      userId,
      member: assigneeMap.get(userId) || "Developer",
      ...stats,
      estimatedHours: Math.round(stats.estimatedHours * 100) / 100,
      // Aliases consumed by /monitoring (developer workload table).
      name: assigneeMap.get(userId) || "Developer",
      activeTasks: stats.inProgress,
      completedTasks: stats.completed,
    }));

    const hasWorkloadImbalance = workload.some((w) => w.inProgress + (w.assigned - w.completed) > 5);

    // 6. Calculate Transparent Project Health Score (Section 18)
    let score = 100;
    const factors: Array<{ name: string; penalty: number; value: number; details: string }> = [];

    if (overdueTasks.length > 0) {
      const penalty = Math.min(30, overdueTasks.length * 10);
      score -= penalty;
      factors.push({ name: "Overdue tasks", penalty, value: overdueTasks.length, details: `${overdueTasks.length} task${overdueTasks.length === 1 ? "" : "s"} past due` });
    }

    if (blockedTasks.length > 0) {
      const penalty = Math.min(30, blockedTasks.length * 15);
      score -= penalty;
      factors.push({ name: "Blocked tasks", penalty, value: blockedTasks.length, details: `${blockedTasks.length} task${blockedTasks.length === 1 ? "" : "s"} blocked` });
    }

    if (highRisks.length > 0) {
      const penalty = Math.min(20, highRisks.length * 10);
      score -= penalty;
      factors.push({ name: "High severity risks", penalty, value: highRisks.length, details: `${highRisks.length} high-severity risk${highRisks.length === 1 ? "" : "s"} open` });
    }

    if (hasWorkloadImbalance) {
      score -= 10;
      factors.push({ name: "Developer workload imbalance (>5 active tasks)", penalty: 10, value: 1, details: "At least one developer carries more than 5 active tasks" });
    }

    score = Math.max(0, Math.min(100, score));
    const healthStatus = score >= 80 ? "healthy" : score >= 55 ? "attention" : "critical";

    // 7. Recent Activity Logs
    const recentLogs = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        value: activityLogs.value,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(eq(activityLogs.projectId, projectId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(6);

    const overallProgress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

    // `severity` mirrors the high-risk rule above (worst of impact and
    // probability) for the /monitoring risk badges.
    const riskLevelRank = (level: unknown): number =>
      level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
    const openRisks = projectRisks.map((risk) => ({
      ...risk,
      severity:
        riskLevelRank(risk.impact) >= riskLevelRank(risk.probability)
          ? risk.impact
          : risk.probability,
    }));

    return successResponse({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        method: project.method,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      health: {
        score,
        status: healthStatus,
        factors,
      },
      progress: overallProgress,
      tasks: {
        total: totalTasks,
        completed: completedTasks.length,
        inProgress: inProgressTasks.length,
        todo: todoTasks.length,
        blocked: blockedTasks.length,
        overdue: overdueTasks.length,
      },
      taskMetrics: {
        total: totalTasks,
        completed: completedTasks.length,
        inProgress: inProgressTasks.length,
        todo: todoTasks.length,
        blocked: blockedTasks.length,
        overdue: overdueTasks.length,
        completionRate: totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0,
      },
      activeSprint: sprintData,
      risks: projectRisks,
      openRisks,
      workload,
      developerWorkload: workload,
      recentActivity: recentLogs,
    });
  } catch (error) {
    console.error("GET /api/monitoring/[projectId] failed:", error);
    return internalErrorResponse();
  }
}
