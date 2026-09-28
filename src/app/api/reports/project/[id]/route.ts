import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext, resolveRequestScope } from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { notFoundResponse } from "@/api/response";
import { db } from "@supabase/client";
import { projects, tasks, sprints, risks, users } from "@supabase/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedContext(req);
    if ("response" in auth) return auth.response;

    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Scope probe (RLS): HR has zero project/report access; FINANCE/LEGAL
    // see member projects only. Missing and inaccessible share one 404.
    {
      const scope = await resolveRequestScope(auth.context.supabase, auth.context.user.id);
      void scope;
      if (!(await isProjectAccessible(auth.context.supabase, projectId))) {
        return notFoundResponse("Project not found");
      }
    }
    // Fetch project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch tasks
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    // Fetch sprints
    const projectSprints = await db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, projectId));

    // Fetch risks
    const projectRisks = await db
      .select()
      .from(risks)
      .where(eq(risks.projectId, projectId));

    // Fetch users for developer workload
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));

    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter(
      (t) => t.columnStatus === "done"
    ).length;
    const blockedTasks = projectTasks.filter(
      (t) => t.isBlocked || t.columnStatus === "blocked"
    ).length;
    const inProgressTasks = projectTasks.filter(
      (t) => t.columnStatus === "inProgress"
    ).length;
    const now = new Date();
    const overdueTasks = projectTasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < now &&
        t.columnStatus !== "done"
    ).length;

    const completedPoints = projectTasks
      .filter((t) => t.columnStatus === "done")
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const totalPoints = projectTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Developer workload map
    const workloadMap = new Map<string, { active: number; completed: number; points: number; hours: number }>();
    for (const t of projectTasks) {
      if (t.assigneeId) {
        if (!workloadMap.has(t.assigneeId)) {
          workloadMap.set(t.assigneeId, { active: 0, completed: 0, points: 0, hours: 0 });
        }
        const stats = workloadMap.get(t.assigneeId)!;
        if (t.columnStatus === "done") {
          stats.completed += 1;
        } else {
          stats.active += 1;
        }
        stats.points += t.points || 0;
        stats.hours += (Number(t.actualHours) || Number(t.estimatedHours) || 0);
      }
    }

    const developerWorkload = Array.from(workloadMap.entries()).map(([userId, stats]) => ({
      userId,
      name: userMap.get(userId) || "Unknown Developer",
      activeTasks: stats.active,
      completedTasks: stats.completed,
      totalPoints: stats.points,
      totalHours: stats.hours,
    }));

    const reportData = {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt,
      },
      summary: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        overdueTasks,
        progressPercent,
        totalPoints,
        completedPoints,
        totalSprints: projectSprints.length,
        activeSprints: projectSprints.filter((s) => s.status === "active").length,
        completedSprints: projectSprints.filter((s) => s.status === "completed").length,
        totalRisks: projectRisks.length,
        openRisks: projectRisks.filter((r) => r.status === "open").length,
      },
      developerWorkload,
      tasks: projectTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.columnStatus,
        priority: t.priority,
        storyPoints: t.points,
        isBlocked: t.isBlocked,
        blockedReason: t.blockedReason,
        assignee: t.assigneeId ? userMap.get(t.assigneeId) : "Unassigned",
      })),
      risks: projectRisks.map((r) => ({
        id: r.id,
        title: r.title,
        severity: r.impact || "medium",
        status: r.status,
        mitigation: r.mitigation,
      })),
    };

    // Check if CSV format is requested
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      let csv = "SmartSprint AI - Project Report\n";
      csv += `Project,${project.name}\nStatus,${project.status}\n\n`;
      csv += `Metric,Value\n`;
      csv += `Total Tasks,${totalTasks}\n`;
      csv += `Completed Tasks,${completedTasks}\n`;
      csv += `In Progress Tasks,${inProgressTasks}\n`;
      csv += `Blocked Tasks,${blockedTasks}\n`;
      csv += `Overdue Tasks,${overdueTasks}\n`;
      csv += `Progress Percent,${progressPercent}%\n`;
      csv += `Total Story Points,${totalPoints}\n`;
      csv += `Completed Story Points,${completedPoints}\n\n`;

      csv += "Developer Workload\n";
      csv += "Developer,Active Tasks,Completed Tasks,Points,Hours\n";
      for (const dev of developerWorkload) {
        csv += `"${dev.name}",${dev.activeTasks},${dev.completedTasks},${dev.totalPoints},${dev.totalHours}\n`;
      }

      csv += "\nTask Breakdown\n";
      csv += "Title,Status,Priority,Points,Blocked,Blocked Reason,Assignee\n";
      for (const t of reportData.tasks) {
        csv += `"${t.title.replace(/"/g, '""')}",${t.status},${t.priority},${t.storyPoints || 0},${t.isBlocked ? "YES" : "NO"},"${(t.blockedReason || "").replace(/"/g, '""')}","${t.assignee}"\n`;
      }

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="project-report-${project.id.slice(0, 8)}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: reportData });
  } catch (error: any) {
    console.error("Project report error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
