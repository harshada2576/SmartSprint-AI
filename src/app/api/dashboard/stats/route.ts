import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import {
  projects,
  tasks,
  sprints,
  users,
  organizationMembers,
  organizations,
  risks,
  activityLogs,
  notifications,
  approvals,
} from "@supabase/schema";
import { eq, and, sql, desc, or, lt, ne } from "drizzle-orm";
import { forbiddenResponse, internalErrorResponse, successResponse } from "@/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const orgId = scope.primaryOrganizationId;
    if (!orgId) {
      return forbiddenResponse();
    }

    const role = scope.primaryRole ?? "DEVELOPER";
    const today = new Date().toISOString().slice(0, 10);

    if (role === "ADMIN") {
      // 1. Total users in org
      const [userCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, orgId));

      // 2. Active users
      const [activeUserCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(and(eq(organizationMembers.organizationId, orgId), eq(users.status, "active")));

      // 3. Organizations count
      const [orgsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(organizations);

      // 4. Projects in org
      const [projCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(eq(projects.organizationId, orgId));

      // 5. Recent system activity
      const recentActivity = await db
        .select({
          id: activityLogs.id,
          action: activityLogs.action,
          value: activityLogs.value,
          entityType: activityLogs.entityType,
          createdAt: activityLogs.createdAt,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(activityLogs)
        .leftJoin(users, eq(users.id, activityLogs.userId))
        .where(eq(activityLogs.organizationId, orgId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(10);

      // 6. Recent audit events (approvals/governance)
      const recentAudit = await db
        .select({
          id: approvals.id,
          title: approvals.title,
          type: approvals.type,
          status: approvals.status,
          requestedAt: approvals.requestedAt,
          decidedAt: approvals.decidedAt,
        })
        .from(approvals)
        .innerJoin(projects, eq(projects.id, approvals.projectId))
        .where(eq(projects.organizationId, orgId))
        .orderBy(desc(approvals.requestedAt))
        .limit(10);

      return successResponse({
        role: "ADMIN",
        totalUsers: userCount?.count ?? 0,
        activeUsers: activeUserCount?.count ?? 0,
        totalOrganizations: orgsCount?.count ?? 1,
        totalProjects: projCount?.count ?? 0,
        recentActivity,
        recentAudit,
      });
    }

    if (role === "DEVELOPER") {
      // 1. My tasks counts
      const [myTotal] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.assigneeId, user.id));

      const [myCompleted] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.assigneeId, user.id), eq(tasks.columnStatus, "done")));

      const [myInProgress] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.assigneeId, user.id), eq(tasks.columnStatus, "inProgress")));

      const [myOverdue] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, user.id),
            ne(tasks.columnStatus, "done"),
            lt(tasks.dueDate, today)
          )
        );

      const [myBlocked] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, user.id),
            or(eq(tasks.isBlocked, true), eq(tasks.columnStatus, "blocked"))
          )
        );

      // My Assigned Tasks List
      const myTasks = await db
        .select({
          id: tasks.id,
          displayId: tasks.displayId,
          title: tasks.title,
          priority: tasks.priority,
          columnStatus: tasks.columnStatus,
          progressPercent: tasks.progressPercent,
          isBlocked: tasks.isBlocked,
          blockedReason: tasks.blockedReason,
          dueDate: tasks.dueDate,
          points: tasks.points,
          projectName: projects.name,
        })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(eq(tasks.assigneeId, user.id))
        .orderBy(desc(tasks.updatedAt))
        .limit(10);

      // Current active sprint (most recent active sprint in user's projects)
      const [activeSprint] = await db
        .select({
          id: sprints.id,
          name: sprints.name,
          goal: sprints.goal,
          status: sprints.status,
          startDate: sprints.startDate,
          endDate: sprints.endDate,
          totalPoints: sprints.totalPoints,
          completedPoints: sprints.completedPoints,
          projectName: projects.name,
        })
        .from(sprints)
        .innerJoin(projects, eq(projects.id, sprints.projectId))
        .where(
          and(
            eq(projects.organizationId, orgId),
            or(eq(sprints.status, "active"), eq(sprints.status, "planning"))
          )
        )
        .orderBy(desc(sprints.updatedAt))
        .limit(1);

      // Notifications
      const recentNotifications = await db
        .select({
          id: notifications.id,
          title: notifications.title,
          description: notifications.description,
          priority: notifications.priority,
          read: notifications.read,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(8);

      return successResponse({
        role: "DEVELOPER",
        myTasksCount: myTotal?.count ?? 0,
        completedTasksCount: myCompleted?.count ?? 0,
        inProgressTasksCount: myInProgress?.count ?? 0,
        overdueTasksCount: myOverdue?.count ?? 0,
        blockedTasksCount: myBlocked?.count ?? 0,
        myTasks,
        activeSprint: activeSprint ?? null,
        notifications: recentNotifications,
      });
    }

    // Default: PROJECT_MANAGER
    const [totalProjects] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.organizationId, orgId));

    const [activeProjects] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), eq(projects.status, "active")));

    const [completedProjects] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), eq(projects.status, "completed")));

    // Tasks in org projects
    const [totalTasks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(projects.organizationId, orgId));

    const [completedTasks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(projects.organizationId, orgId), eq(tasks.columnStatus, "done")));

    const [overdueTasks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(projects.organizationId, orgId),
          ne(tasks.columnStatus, "done"),
          lt(tasks.dueDate, today)
        )
      );

    const [blockedTasks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(projects.organizationId, orgId),
          or(eq(tasks.isBlocked, true), eq(tasks.columnStatus, "blocked"))
        )
      );

    // Active sprint
    const [activeSprint] = await db
      .select({
        id: sprints.id,
        name: sprints.name,
        goal: sprints.goal,
        status: sprints.status,
        startDate: sprints.startDate,
        endDate: sprints.endDate,
        totalPoints: sprints.totalPoints,
        completedPoints: sprints.completedPoints,
        projectName: projects.name,
      })
      .from(sprints)
      .innerJoin(projects, eq(projects.id, sprints.projectId))
      .where(
        and(
          eq(projects.organizationId, orgId),
          or(eq(sprints.status, "active"), eq(sprints.status, "planning"))
        )
      )
      .orderBy(desc(sprints.updatedAt))
      .limit(1);

    // High risks
    const [highRisks] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(risks)
      .innerJoin(projects, eq(projects.id, risks.projectId))
      .where(
        and(
          eq(projects.organizationId, orgId),
          eq(risks.status, "open"),
          or(eq(risks.impact, "high"), eq(risks.probability, "high"))
        )
      );

    // Project Health calculation: starts at 100, penalties for overdue, blocked, high risks
    const overdueCount = overdueTasks?.count ?? 0;
    const blockedCount = blockedTasks?.count ?? 0;
    const highRiskCount = highRisks?.count ?? 0;

    let healthScore = 100;
    healthScore -= Math.min(overdueCount * 5, 30);
    healthScore -= Math.min(blockedCount * 8, 30);
    healthScore -= Math.min(highRiskCount * 10, 30);
    healthScore = Math.max(0, Math.min(100, healthScore));

    const healthStatus =
      healthScore >= 80 ? "healthy" : healthScore >= 60 ? "attention" : "at_risk";

    // Recent activity
    const recentActivity = await db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        value: activityLogs.value,
        entityType: activityLogs.entityType,
        createdAt: activityLogs.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.userId))
      .where(eq(activityLogs.organizationId, orgId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(8);

    return successResponse({
      role: "PROJECT_MANAGER",
      totalProjects: totalProjects?.count ?? 0,
      activeProjects: activeProjects?.count ?? 0,
      completedProjects: completedProjects?.count ?? 0,
      totalTasks: totalTasks?.count ?? 0,
      completedTasks: completedTasks?.count ?? 0,
      overdueTasks: overdueCount,
      blockedTasks: blockedCount,
      activeSprint: activeSprint ?? null,
      highRisksCount: highRiskCount,
      projectHealth: {
        score: healthScore,
        status: healthStatus,
        factors: [
          { name: "Overdue tasks", value: overdueCount, penalty: Math.min(overdueCount * 5, 30) },
          { name: "Blocked tasks", value: blockedCount, penalty: Math.min(blockedCount * 8, 30) },
          { name: "High risks", value: highRiskCount, penalty: Math.min(highRiskCount * 10, 30) },
        ],
      },
      recentActivity,
    });
  } catch (err) {
    console.error("GET /api/dashboard/stats error:", err);
    return internalErrorResponse();
  }
}
