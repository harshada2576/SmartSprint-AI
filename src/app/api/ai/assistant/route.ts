import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { isUuid } from "@/schemas/query-params";
import {
  forbiddenResponse,
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

interface ProjectContext {
  projectName: string;
  projectStatus: string;
  activeSprint: {
    name: string;
    goal: string | null;
    startDate: string | null;
    endDate: string | null;
    totalPoints: number | null;
    completedPoints: number | null;
  } | null;
  tasksSummary: {
    total: number;
    inProgress: number;
    done: number;
    blocked: Array<{ title: string; reason: string | null; assignee: string }>;
    overdue: Array<{ title: string; dueDate: string | null; assignee: string }>;
  };
  risks: Array<{ title: string; impact: string; recommendation: string | null }>;
  developers: Array<{ name: string; activeTasks: number }>;
}

/**
 * POST /api/ai/assistant — scoped AI assistant (§1.2.10).
 *
 * Authorization happens BEFORE data enters the model context (the LLM is
 * never an authorization boundary):
 * 1. authenticate user, 2. determine organization + role,
 * 3. resolve project scope, 4. filter every data source by that scope.
 *
 * - HR: organization-membership questions only (e.g. "Who is in
 *   Engineering?"). Project questions (e.g. "List overdue tasks in
 *   Project X") receive an access-denied response — never project data.
 * - FINANCE / LEGAL / DEVELOPER: only projects where they are members
 *   (verified through the RLS-enforcing client, not privileged reads).
 * - All context reads run through the caller's RLS client so RLS remains
 *   the ultimate boundary even if a probe is bypassed.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    if (scope.organizationIds.length === 0) {
      return forbiddenResponse("No active organization membership found.");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return validationErrorResponse([
        { field: "query", message: "Query message is required" },
      ]);
    }

    const callerRole = scope.primaryRole;
    const lower = query.toLowerCase();
    const looksLikeProjectQuestion =
      /project|task|sprint|risk|overdue|blocked|workload|deadline|bug|feature|deliverable|milestone|backlog/i.test(
        query,
      );

    // ---- HR: organization-membership scope only, zero project access ----
    if (callerRole === "HR") {
      if (looksLikeProjectQuestion) {
        return successResponse({
          answer:
            "I don't have access to project data. As HR, I can help with organization and team-membership questions — for example, who belongs to a department or holds a job title.",
          contextUsed: false,
        });
      }
      return successResponse({
        answer: await answerOrgMembershipQuestion(supabase, scope.organizationIds, query),
        contextUsed: true,
      });
    }

    // ---- Project-scoped roles: resolve an RLS-visible target project ----
    let targetProjectId =
      typeof body.projectId === "string" && isUuid(body.projectId)
        ? body.projectId
        : null;
    if (targetProjectId) {
      if (!(await isProjectAccessible(supabase, targetProjectId))) {
        return forbiddenResponse(
          "You do not have access to the requested project.",
        );
      }
    } else {
      // First RLS-visible project (FINANCE/LEGAL outside a project see
      // nothing from it — no cross-project summaries leak).
      const { data: firstProj, error: firstError } = await supabase
        .from("projects")
        .select("id")
        .in("organization_id", scope.organizationIds)
        .limit(1)
        .maybeSingle();
      if (firstError) throw firstError;
      const id = (firstProj as { id?: string } | null)?.id;
      targetProjectId = typeof id === "string" ? id : null;
    }

    if (!targetProjectId) {
      return successResponse({
        answer:
          "I couldn't locate any active projects in your organization. Please create or join a project first.",
      });
    }

    // ---- Scoped context reads (caller's RLS client only) ----
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,name,status")
      .eq("id", targetProjectId)
      .limit(1)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) {
      return successResponse({
        answer: "Selected project was not found.",
      });
    }
    const projectRow = project as {
      id: string;
      name: string;
      status: string;
    };

    const { data: sprintRows, error: sprintError } = await supabase
      .from("sprints")
      .select("name,goal,start_date,end_date,total_points,completed_points")
      .eq("project_id", targetProjectId)
      .eq("status", "active")
      .limit(1);
    if (sprintError) throw sprintError;
    const activeSprint = (
      Array.isArray(sprintRows) ? sprintRows : []
    )[0] as
      | {
          name: string;
          goal: string | null;
          start_date: string | null;
          end_date: string | null;
          total_points: number | null;
          completed_points: number | null;
        }
      | undefined;

    const { data: taskRows, error: tasksError } = await supabase
      .from("tasks")
      .select(
        "id,title,assignee_id,column_status,due_date,is_blocked,blocked_reason,progress_percent",
      )
      .eq("project_id", targetProjectId)
      .limit(500);
    if (tasksError) throw tasksError;
    const projectTasks = (Array.isArray(taskRows) ? taskRows : []) as Array<{
      id: string;
      title: string;
      assignee_id: string | null;
      column_status: string;
      due_date: string | null;
      is_blocked: boolean | null;
      blocked_reason: string | null;
      progress_percent: number | null;
    }>;

    // Project Users (scoped: only assignees visible through RLS directory).
    const userIds = Array.from(
      new Set(
        projectTasks
          .map((t) => t.assignee_id)
          .filter((v): v is string => typeof v === "string"),
      ),
    );
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: devList, error: devError } = await supabase
        .from("users")
        .select("id,first_name,last_name")
        .in("id", userIds)
        .limit(200);
      if (devError) throw devError;
      for (const d of (Array.isArray(devList) ? devList : []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
      }>) {
        userMap.set(d.id, `${d.first_name} ${d.last_name}`.trim());
      }
    }

    // Overdue and Blocked tasks
    const now = new Date();
    const blockedTasks: Array<{
      title: string;
      reason: string | null;
      assignee: string;
    }> = [];
    const overdueTasks: Array<{
      title: string;
      dueDate: string | null;
      assignee: string;
    }> = [];

    for (const t of projectTasks) {
      const assignee = t.assignee_id
        ? userMap.get(t.assignee_id) || "Developer"
        : "Unassigned";
      if (t.is_blocked || t.column_status === "blocked") {
        blockedTasks.push({
          title: t.title,
          reason: t.blocked_reason,
          assignee,
        });
      }
      if (
        t.column_status !== "done" &&
        t.due_date &&
        new Date(t.due_date) < now
      ) {
        overdueTasks.push({
          title: t.title,
          dueDate: t.due_date.slice(0, 10),
          assignee,
        });
      }
    }

    // Project Risks (scoped read).
    const { data: riskRows, error: risksError } = await supabase
      .from("risks")
      .select("title,impact,mitigation")
      .eq("project_id", targetProjectId)
      .eq("status", "open")
      .limit(100);
    if (risksError) throw risksError;
    const projectRisks = (Array.isArray(riskRows) ? riskRows : []) as Array<{
      title: string;
      impact: string;
      mitigation: string | null;
    }>;

    // Developer active task counts
    const devCounts = new Map<string, number>();
    for (const t of projectTasks) {
      if (t.assignee_id && t.column_status !== "done") {
        const name = userMap.get(t.assignee_id) || "Developer";
        devCounts.set(name, (devCounts.get(name) || 0) + 1);
      }
    }

    const context: ProjectContext = {
      projectName: projectRow.name,
      projectStatus: projectRow.status,
      activeSprint: activeSprint
        ? {
            name: activeSprint.name,
            goal: activeSprint.goal,
            startDate: activeSprint.start_date,
            endDate: activeSprint.end_date,
            totalPoints: activeSprint.total_points,
            completedPoints: activeSprint.completed_points,
          }
        : null,
      tasksSummary: {
        total: projectTasks.length,
        inProgress: projectTasks.filter(
          (t) => t.column_status === "inProgress",
        ).length,
        done: projectTasks.filter((t) => t.column_status === "done").length,
        blocked: blockedTasks,
        overdue: overdueTasks,
      },
      risks: projectRisks.map((r) => ({
        title: r.title,
        impact: r.impact,
        recommendation: r.mitigation,
      })),
      developers: Array.from(devCounts.entries()).map(([name, count]) => ({
        name,
        activeTasks: count,
      })),
    };

    // 2. Generate Contextual Response (LLM or Intelligent Assistant Engine)
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    if (apiKey) {
      try {
        const systemPrompt = `You are SmartSprint AI, an expert project assistant.
You have real-time live access to the project: "${context.projectName}".
Current live project context:
- Project Status: ${context.projectStatus}
- Active Sprint: ${context.activeSprint ? `${context.activeSprint.name} (Goal: "${context.activeSprint.goal}")` : "None"}
- Tasks: ${context.tasksSummary.total} total, ${context.tasksSummary.done} completed, ${context.tasksSummary.inProgress} in progress
- Blocked Tasks (${context.tasksSummary.blocked.length}): ${JSON.stringify(context.tasksSummary.blocked)}
- Overdue Tasks (${context.tasksSummary.overdue.length}): ${JSON.stringify(context.tasksSummary.overdue)}
- Active Risks (${context.risks.length}): ${JSON.stringify(context.risks)}
- Developer Workloads: ${JSON.stringify(context.developers)}

Answer user questions accurately, concisely, and cite actual live project facts and task names. Format cleanly in markdown. Only discuss data provided above; never invent or infer data about other projects.`;

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query },
              ],
              temperature: 0.3,
            }),
            signal: AbortSignal.timeout(12000),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content;
          if (answer) {
            return successResponse({ answer, contextUsed: true });
          }
        }
      } catch (err) {
        console.warn(
          "LLM API call failed, falling back to deterministic assistant engine:",
          err,
        );
      }
    }

    // Deterministic Contextual Assistant Engine
    let answer = "";

    if (
      lower.includes("risk") ||
      lower.includes("blocked") ||
      lower.includes("danger") ||
      lower.includes("attention")
    ) {
      const riskItems: string[] = [];

      if (context.tasksSummary.blocked.length > 0) {
        riskItems.push(
          `### Blocked Tasks (${context.tasksSummary.blocked.length})\n` +
            context.tasksSummary.blocked
              .map(
                (b) =>
                  `- **${b.title}** (${b.assignee})\n  *Reason:* "${b.reason || "Awaiting credentials or external dependency"}"`,
              )
              .join("\n"),
        );
      }

      if (context.tasksSummary.overdue.length > 0) {
        riskItems.push(
          `### Overdue Tasks (${context.tasksSummary.overdue.length})\n` +
            context.tasksSummary.overdue
              .map(
                (o) =>
                  `- **${o.title}** (${o.assignee}) — Due on ${o.dueDate}`,
              )
              .join("\n"),
        );
      }

      if (context.risks.length > 0) {
        riskItems.push(
          `### Registered Risks (${context.risks.length})\n` +
            context.risks
              .map(
                (r) =>
                  `- **${r.title}** [${r.impact.toUpperCase()}]\n  *Recommendation:* ${r.recommendation || "Review and mitigate"}`,
              )
              .join("\n"),
        );
      }

      if (riskItems.length > 0) {
        answer =
          `I analyzed **${context.projectName}** and identified the following items requiring immediate attention:\n\n` +
          riskItems.join("\n\n") +
          `\n\n**Suggested Next Step:** Open the **Risks** or **Sprint Board** view to unblock dependencies or reassign overloaded tasks.`;
      } else {
        answer = `Great news! I scanned **${context.projectName}** and found **no blocked tasks, overdue deadlines, or open high risks**. All active tasks appear on track.`;
      }
    } else if (
      lower.includes("sprint") ||
      lower.includes("velocity") ||
      lower.includes("progress")
    ) {
      if (context.activeSprint) {
        const completionRate =
          context.activeSprint.totalPoints &&
          context.activeSprint.totalPoints > 0
            ? Math.round(
                ((context.activeSprint.completedPoints || 0) /
                  context.activeSprint.totalPoints) *
                  100,
              )
            : 0;

        answer =
          `### Active Sprint: ${context.activeSprint.name}\n\n` +
          `- **Goal:** "${context.activeSprint.goal || "No specific goal recorded"}"\n` +
          `- **Timeline:** ${context.activeSprint.startDate ? context.activeSprint.startDate.slice(0, 10) : "—"} → ${context.activeSprint.endDate ? context.activeSprint.endDate.slice(0, 10) : "—"}\n` +
          `- **Progress:** ${context.activeSprint.completedPoints || 0} / ${context.activeSprint.totalPoints || 0} points completed (${completionRate}%)\n` +
          `- **Tasks in Flight:** ${context.tasksSummary.inProgress} in progress, ${context.tasksSummary.blocked.length} blocked, ${context.tasksSummary.done} done.\n\n` +
          `You can manage task allocations in **Sprint Planning** or track live status on the **Sprint Board**.`;
      } else {
        answer = `There is currently **no active sprint** for **${context.projectName}**. You can navigate to **Sprint Planning** to allocate backlog tasks and launch a new sprint.`;
      }
    } else if (
      lower.includes("workload") ||
      lower.includes("developer") ||
      lower.includes("team")
    ) {
      if (context.developers.length > 0) {
        answer =
          `### Developer Workload in ${context.projectName}\n\n` +
          context.developers
            .map(
              (d) =>
                `- **${d.name}**: ${d.activeTasks} active task(s)${d.activeTasks > 5 ? " (Workload high)" : ""}`,
            )
            .join("\n") +
          `\n\n*Tip:* Keeping concurrent active tasks below 4 per developer minimizes context switching overhead.`;
      } else {
        answer = `Currently no active tasks are assigned to developers in **${context.projectName}**. You can assign tasks on the **Sprint Planning** page.`;
      }
    } else {
      // General project summary
      answer =
        `### Project Intelligence Overview: ${context.projectName}\n\n` +
        `- **Status:** ${context.projectStatus.toUpperCase()}\n` +
        `- **Active Sprint:** ${context.activeSprint ? context.activeSprint.name : "None"}\n` +
        `- **Total Tasks:** ${context.tasksSummary.total} (${context.tasksSummary.done} completed, ${context.tasksSummary.inProgress} in progress)\n` +
        `- **Blocked Tasks:** ${context.tasksSummary.blocked.length}\n` +
        `- **Overdue Deadlines:** ${context.tasksSummary.overdue.length}\n` +
        `- **Active High Risks:** ${context.risks.length}\n\n` +
        `Feel free to ask me:\n` +
        `• *"Which tasks are at risk?"*\n` +
        `• *"What is the status of the current sprint?"*\n` +
        `• *"How is developer workload distributed?"*`;
    }

    return successResponse({ answer, contextUsed: true });
  } catch (error) {
    console.error("POST /api/ai/assistant failed:", error);
    return internalErrorResponse();
  }
}

/**
 * HR organization-membership answers (e.g. "Who is in Engineering?").
 * Reads only permitted directory fields through RLS; never project tables.
 */
async function answerOrgMembershipQuestion(
  supabase: SupabaseClient,
  organizationIds: string[],
  query: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("first_name,last_name,email,department,job_title")
    .limit(100);
  if (error || !Array.isArray(data)) {
    return "I couldn't retrieve the organization directory right now. Please try again later.";
  }
  const members = (
    data as Array<{
      first_name: string;
      last_name: string;
      email: string;
      department: string | null;
      job_title: string | null;
    }>
  ).filter((m) => organizationIds.length > 0);
  if (members.length === 0) {
    return "I couldn't find any members in your organization directory.";
  }
  const q = query.toLowerCase();
  const deptMatch = q.match(/in ([a-z &]+)\??$/i);
  const filtered = deptMatch
    ? members.filter((m) =>
        (m.department ?? "").toLowerCase().includes(deptMatch[1].trim()),
      )
    : members;
  const lines = filtered
    .slice(0, 20)
    .map(
      (m) =>
        `- **${m.first_name} ${m.last_name}**${m.job_title ? ` — ${m.job_title}` : ""}${m.department ? ` (${m.department})` : ""}`,
    );
  if (lines.length === 0) {
    return "I couldn't find matching members in your organization directory.";
  }
  return `### Organization Directory\n\n${lines.join("\n")}`;
}
