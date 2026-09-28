import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { db } from "@/db";
import { users, organizationMembers, tasks, sprints } from "@supabase/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { forbiddenResponse, internalErrorResponse, successResponse } from "@/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.organizationIds.length === 0) {
      return successResponse([]);
    }

    // Matrix (Team): HR has no project-team roster/workload access.
    // Organization/member management for HR lives under
    // /api/organization/members instead.
    if (
      scope.primaryRole === "HR" &&
      !Object.values(scope.rolesByOrg).some((role) => role !== "HR")
    ) {
      return forbiddenResponse("Insufficient permissions");
    }

    // Fetch organization members in caller's organizations
    const members = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: users.department,
        jobTitle: users.jobTitle,
        avatarInitials: users.avatarInitials,
        role: organizationMembers.role,
        organizationId: organizationMembers.organizationId,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(inArray(organizationMembers.organizationId, scope.organizationIds));

    // Deduplicate by user id (in case user is in multiple orgs)
    const uniqueUserMap = new Map<string, typeof members[0]>();
    for (const m of members) {
      if (!uniqueUserMap.has(m.id)) {
        uniqueUserMap.set(m.id, m);
      }
    }
    const userIds = Array.from(uniqueUserMap.keys());

    if (userIds.length === 0) {
      return successResponse([]);
    }

    // Query task stats for these users
    const userTasks = await db
      .select({
        assigneeId: tasks.assigneeId,
        columnStatus: tasks.columnStatus,
        isBlocked: tasks.isBlocked,
        points: tasks.points,
        estimatedHours: tasks.estimatedHours,
        sprintId: tasks.sprintId,
      })
      .from(tasks)
      .where(inArray(tasks.assigneeId, userIds));

    // Fetch active sprint names
    const activeSprints = await db
      .select({
        id: sprints.id,
        name: sprints.name,
      })
      .from(sprints)
      .where(eq(sprints.status, "active"));

    const activeSprintMap = new Map<string, string>();
    for (const s of activeSprints) {
      activeSprintMap.set(s.id, s.name);
    }

    // Aggregate stats per user
    const statsMap = new Map<string, {
      activeTasks: number;
      completedTasks: number;
      blockedTasks: number;
      workloadHours: number;
      currentSprint: string | null;
    }>();

    for (const id of userIds) {
      statsMap.set(id, {
        activeTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
        workloadHours: 0,
        currentSprint: null,
      });
    }

    for (const t of userTasks) {
      if (!t.assigneeId) continue;
      const stat = statsMap.get(t.assigneeId);
      if (!stat) continue;

      if (t.columnStatus === "done") {
        stat.completedTasks += 1;
      } else {
        stat.activeTasks += 1;
        const hours = t.estimatedHours !== null && t.estimatedHours !== undefined ? Number(t.estimatedHours) : (t.points ? Number(t.points) * 4 : 4);
        stat.workloadHours += Number.isNaN(hours) ? 4 : hours;
        if (t.isBlocked || t.columnStatus === "blocked") {
          stat.blockedTasks += 1;
        }
        if (t.sprintId && activeSprintMap.has(t.sprintId) && !stat.currentSprint) {
          stat.currentSprint = activeSprintMap.get(t.sprintId) ?? null;
        }
      }
    }

    const result = Array.from(uniqueUserMap.values()).map((u) => {
      const stats = statsMap.get(u.id) || {
        activeTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
        workloadHours: 0,
        currentSprint: null,
      };
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        role: u.role,
        department: u.department || "Engineering",
        jobTitle: u.jobTitle || (u.role === "PROJECT_MANAGER" ? "Project Manager" : u.role === "ADMIN" ? "Administrator" : "Software Engineer"),
        avatarInitials: u.avatarInitials || `${u.firstName[0] || ""}${u.lastName[0] || ""}`.toUpperCase(),
        activeTasks: stats.activeTasks,
        completedTasks: stats.completedTasks,
        blockedTasks: stats.blockedTasks,
        workloadHours: stats.workloadHours,
        currentSprint: stats.currentSprint || "None",
      };
    });

    return successResponse(result);
  } catch (error) {
    console.error("GET /api/team failed:", error);
    return internalErrorResponse();
  }
}
