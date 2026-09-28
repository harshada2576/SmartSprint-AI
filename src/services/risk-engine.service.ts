import {
  aiInsights,
  risks,
  taskDependencies,
  tasks,
  sprints,
  users,
} from "@supabase/schema";
import { eq, and, inArray } from "drizzle-orm";
import { aiInsightDedupKey } from "./rbac";

export type RiskDomainValue = "technical" | "budget" | "resource" | "legal";

export interface DetectedRisk {
  id?: string;
  projectId: string;
  taskId?: string | null;
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
  probability: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  source: "ai" | "manual";
  status: "open" | "mitigated" | "closed";
  /** Stable issue classification for AI-insight deduplication. */
  issueType:
    | "overdue_task"
    | "imminent_deadline"
    | "blocked_task"
    | "workload_imbalance"
    | "sprint_delivery"
    | "dependency_incomplete";
  riskDomain: RiskDomainValue;
  createdAt?: string;
}

/**
 * Deterministic domain classification (§1.2.5, §1.3 AI risk domain).
 * Blocked-task reasons mentioning budget/cost/payment classify as budget,
 * contract/vendor/legal/compliance as legal; overload/schedule pressure as
 * resource; everything else (incl. dependency/sprint mechanics) as technical.
 */
export function classifyRiskDomain(
  issueType: DetectedRisk["issueType"],
  blockedReason: string | null | undefined,
): RiskDomainValue {
  const reason = (blockedReason ?? "").toLowerCase();
  if (/\b(budget|cost|invoice|payment|funding|expense)\b/.test(reason)) {
    return "budget";
  }
  if (/\b(contract|vendor|legal|compliance|license|procurement)\b/.test(reason)) {
    return "legal";
  }
  switch (issueType) {
    case "workload_imbalance":
    case "imminent_deadline":
    case "overdue_task":
      return "resource";
    case "blocked_task":
    case "dependency_incomplete":
    case "sprint_delivery":
    default:
      return "technical";
  }
}

/**
 * Runs deterministic AI risk detection engine for a project.
 * Implements Rules A, B, C, D, E plus Rule F (dependency-incomplete).
 * Persists detected risks to `risks` (source='ai', classified risk_domain)
 * and to `ai_insights` (equivalence key project_id + issue_type +
 * entity_id) without creating duplicate entries:
 * - an equivalent active insight is timestamp-touched, not duplicated;
 * - an unchanged rejected insight is never resurfaced;
 * - a re-detected issue whose insight was resolved re-opens it.
 */
export async function runProjectRiskAnalysis(
  projectId: string,
): Promise<DetectedRisk[]> {
  const now = new Date();
  const { db } = await import("@/db");

  // 1. Fetch project tasks
  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  // 2. Fetch project sprints
  const projectSprints = await db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId));

  // 2b. Fetch dependency edges for dependency-aware detection.
  const projectTaskIds = projectTasks.map((t) => t.id);
  const depEdges =
    projectTaskIds.length > 0
      ? await db
          .select()
          .from(taskDependencies)
          .where(inArray(taskDependencies.taskId, projectTaskIds as [string, ...string[]]))
      : [];
  const incompleteByTask = new Map<string, string[]>();
  const taskById = new Map(projectTasks.map((t) => [t.id, t]));
  for (const edge of depEdges) {
    const target = taskById.get(edge.dependsOnTaskId);
    if (target && target.columnStatus !== "done") {
      const list = incompleteByTask.get(edge.taskId) ?? [];
      list.push(target.title);
      incompleteByTask.set(edge.taskId, list);
    }
  }

  // 3. Fetch active developers assigned to tasks
  const assigneeIds = Array.from(
    new Set(projectTasks.map((t) => t.assigneeId).filter(Boolean)),
  ) as string[];
  const assigneeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const devs = await db
      .select({ id: users.id, name: users.firstName, lastName: users.lastName })
      .from(users)
      .where(inArray(users.id, assigneeIds as [string, ...string[]]));
    for (const d of devs) {
      assigneeMap.set(d.id, `${d.name} ${d.lastName}`.trim());
    }
  }

  const detected: DetectedRisk[] = [];

  // RULE D: Task overdue (due date in past and status not done)
  for (const t of projectTasks) {
    if (t.columnStatus !== "done" && t.dueDate) {
      const due = new Date(t.dueDate);
      if (due < now) {
        const daysOverdue = Math.max(
          1,
          Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
        );
        detected.push({
          projectId,
          taskId: t.id,
          title: `Overdue Task: ${t.title}`,
          description: `Task "${t.title}" is overdue by ${daysOverdue} day(s) and currently in ${t.columnStatus} state with ${t.progressPercent}% progress.`,
          evidence: [
            `Due date was ${t.dueDate.slice(0, 10)} (${daysOverdue} days past)`,
            `Current progress: ${t.progressPercent}%`,
            `Status: ${t.columnStatus}`,
            t.assigneeId
              ? `Assigned to: ${assigneeMap.get(t.assigneeId) || "Developer"}`
              : "Unassigned",
          ],
          recommendation:
            "Immediately review blockers, re-estimate remaining work, or reallocate capacity to complete this task.",
          probability: "high",
          impact:
            (t.priority as string) === "critical" || t.priority === "high"
              ? "high"
              : "medium",
          source: "ai",
          status: "open",
          issueType: "overdue_task",
          riskDomain: classifyRiskDomain("overdue_task", null),
        });
      }
    }
  }

  // RULE A: Task due within 48 hours AND progress < 50%
  for (const t of projectTasks) {
    if (t.columnStatus !== "done" && t.dueDate) {
      const due = new Date(t.dueDate);
      const hoursToDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursToDue > 0 && hoursToDue <= 48 && (t.progressPercent ?? 0) < 50) {
        detected.push({
          projectId,
          taskId: t.id,
          title: `Imminent Deadline Risk: ${t.title}`,
          description: `Task "${t.title}" is due within ${Math.round(hoursToDue)} hours, but completion is only at ${t.progressPercent}%.`,
          evidence: [
            `Due in ${Math.round(hoursToDue)} hours (${t.dueDate.slice(0, 10)})`,
            `Progress is currently ${t.progressPercent}% (< 50% threshold)`,
            `Priority: ${t.priority}`,
          ],
          recommendation:
            "Pair-program on remaining requirements, descope non-essential acceptance criteria, or assign assisting developer.",
          probability: "high",
          impact: "high",
          source: "ai",
          status: "open",
          issueType: "imminent_deadline",
          riskDomain: classifyRiskDomain("imminent_deadline", null),
        });
      }
    }
  }

  // RULE B: Task blocked
  for (const t of projectTasks) {
    if (t.isBlocked || t.columnStatus === "blocked") {
      const blockedHours = t.blockedAt
        ? Math.round(
            (now.getTime() - new Date(t.blockedAt).getTime()) /
              (1000 * 60 * 60),
          )
        : 24;

      detected.push({
        projectId,
        taskId: t.id,
        title: `Blocked Task: ${t.title}`,
        description: `Task "${t.title}" is actively blocked. Reason provided: "${t.blockedReason || "Awaiting external dependency"}".`,
        evidence: [
          `Task flagged as blocked (${blockedHours}h duration)`,
          `Blocker explanation: "${t.blockedReason || "No detailed reason specified"}"`,
          `Assignee: ${t.assigneeId ? assigneeMap.get(t.assigneeId) || "Developer" : "Unassigned"}`,
        ],
        recommendation:
          "Escalate external dependency, contact responsible stakeholder, or unblock credentials immediately.",
        probability: "high",
        impact:
          (t.priority as string) === "critical" || t.priority === "high"
            ? "high"
            : "medium",
        source: "ai",
        status: "open",
        issueType: "blocked_task",
        riskDomain: classifyRiskDomain("blocked_task", t.blockedReason),
      });
    }
  }

  // RULE F: Dependency-incomplete tasks (task_dependencies edges whose
  // targets are not done). Required for dependency-aware risk detection.
  for (const t of projectTasks) {
    const incomplete = incompleteByTask.get(t.id);
    if (incomplete && incomplete.length > 0 && t.columnStatus !== "done") {
      detected.push({
        projectId,
        taskId: t.id,
        title: `Dependency Risk: ${t.title}`,
        description: `Task "${t.title}" depends on ${incomplete.length} incomplete task(s): ${incomplete.slice(0, 3).join(", ")}${incomplete.length > 3 ? "..." : ""}.`,
        evidence: [
          `${incomplete.length} upstream dependencies incomplete`,
          `Blocked by: ${incomplete.slice(0, 3).join(", ")}`,
          `Status: ${t.columnStatus}`,
        ],
        recommendation:
          "Sequence upstream dependencies first or re-plan the sprint order to unblock this task.",
        probability: "medium",
        impact: "medium",
        source: "ai",
        status: "open",
        issueType: "dependency_incomplete",
        riskDomain: classifyRiskDomain("dependency_incomplete", null),
      });
    }
  }

  // RULE C: Developer has > 5 active tasks (workload risk)
  const tasksPerDev = new Map<string, typeof projectTasks>();
  for (const t of projectTasks) {
    if (t.assigneeId && t.columnStatus !== "done") {
      const list = tasksPerDev.get(t.assigneeId) || [];
      list.push(t);
      tasksPerDev.set(t.assigneeId, list);
    }
  }

  for (const [devId, devTasks] of tasksPerDev.entries()) {
    if (devTasks.length > 5) {
      const devName = assigneeMap.get(devId) || "Developer";
      detected.push({
        projectId,
        title: `Workload Imbalance: ${devName}`,
        description: `${devName} has ${devTasks.length} in-flight active tasks, creating context switching overhead and bottleneck risk.`,
        evidence: [
          `${devTasks.length} concurrently active tasks assigned`,
          `Estimated combined effort: ${devTasks.reduce((s, t) => s + (Number(t.estimatedHours) || 8), 0)} hours`,
          `Tasks include: ${devTasks.slice(0, 3).map((t) => t.title).join(", ")}...`,
        ],
        recommendation:
          "Redistribute 2-3 tasks to other team members to balance sprint velocity and reduce burnout.",
        probability: "medium",
        impact: "high",
        source: "ai",
        status: "open",
        issueType: "workload_imbalance",
        riskDomain: classifyRiskDomain("workload_imbalance", null),
      });
    }
  }

  // RULE E: Sprint ends soon AND significant work remains
  for (const s of projectSprints) {
    if (s.status === "active" && s.endDate) {
      const sprintEnd = new Date(s.endDate);
      const daysToSprintEnd =
        (sprintEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const sprintTasks = projectTasks.filter((t) => t.sprintId === s.id);
      const incompleteTasks = sprintTasks.filter(
        (t) => t.columnStatus !== "done",
      );

      if (
        daysToSprintEnd <= 3 &&
        daysToSprintEnd >= 0 &&
        incompleteTasks.length > sprintTasks.length * 0.4
      ) {
        detected.push({
          projectId,
          title: `Sprint Delivery Risk: ${s.name}`,
          description: `Sprint "${s.name}" ends in ${Math.max(1, Math.round(daysToSprintEnd))} day(s) but has ${incompleteTasks.length}/${sprintTasks.length} tasks remaining incomplete.`,
          evidence: [
            `Days remaining: ${Math.max(1, Math.round(daysToSprintEnd))}`,
            `Incomplete tasks: ${incompleteTasks.length} (${Math.round((incompleteTasks.length / (sprintTasks.length || 1)) * 100)}%)`,
            `Sprint goal: "${s.goal || "Not specified"}"`,
          ],
          recommendation:
            "Conduct mid-sprint scope triage. Prioritize must-have deliverables and defer stretch backlog items.",
          probability: "high",
          impact: "high",
          source: "ai",
          status: "open",
          issueType: "sprint_delivery",
          riskDomain: classifyRiskDomain("sprint_delivery", null),
        });
      }
    }
  }

  // 4. De-duplicate against existing open risks in database (title|taskId).
  const existingRisks = await db
    .select()
    .from(risks)
    .where(and(eq(risks.projectId, projectId), eq(risks.status, "open")));

  const existingTitles = new Set(
    existingRisks.map((r) => `${r.title}|${r.taskId || ""}`),
  );

  for (const r of detected) {
    const key = `${r.title}|${r.taskId || ""}`;
    if (!existingTitles.has(key)) {
      await db.insert(risks).values({
        projectId: r.projectId,
        taskId: r.taskId || null,
        title: r.title,
        description: r.description,
        probability: r.probability,
        impact: r.impact,
        mitigation: r.recommendation,
        status: "open",
        source: "ai",
        riskDomain: r.riskDomain,
      });
      existingTitles.add(key);
    }
  }

  // 4b. Upsert AI insights with the equivalence key
  // project_id + issue_type + entity_id (§5 dedup). Active equivalents are
  // timestamp-touched; unchanged rejected insights are never resurfaced;
  // resolved insights for a persisting issue re-open.
  const existingInsights = await db
    .select()
    .from(aiInsights)
    .where(eq(aiInsights.projectId, projectId));

  const insightByKey = new Map(
    existingInsights.map((row) => [
      aiInsightDedupKey(row.projectId, row.type, row.entityId),
      row,
    ]),
  );

  for (const r of detected) {
    const entityId = r.taskId ?? null;
    const key = aiInsightDedupKey(projectId, r.issueType, entityId);
    const existing = insightByKey.get(key);
    if (!existing) {
      const created = await db
        .insert(aiInsights)
        .values({
          projectId,
          type: r.issueType,
          title: r.title,
          description: r.description,
          severity: r.impact,
          reasoning: {
            evidence: r.evidence,
            recommendation: r.recommendation,
            probability: r.probability,
          },
          status: "active",
          issueType: r.issueType,
          entityId,
          riskDomain: r.riskDomain,
          dedupKey: key,
        })
        .returning();
      if (created[0]) insightByKey.set(key, created[0]);
    } else if (existing.status === "active") {
      await db
        .update(aiInsights)
        .set({
          title: r.title,
          description: r.description,
          severity: r.impact,
          reasoning: {
            evidence: r.evidence,
            recommendation: r.recommendation,
            probability: r.probability,
          },
          riskDomain: r.riskDomain,
          dedupKey: key,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiInsights.id, existing.id));
    } else if (existing.status === "resolved") {
      await db
        .update(aiInsights)
        .set({
          status: "active",
          title: r.title,
          description: r.description,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiInsights.id, existing.id));
    }
    // status approved/rejected: a human decided; do not resurface an
    // unchanged insight. A genuinely changed issue arrives under a new
    // title/entity and creates a fresh insight.
  }

  // 5. Read back all current open risks for project
  const updatedRisks = await db
    .select()
    .from(risks)
    .where(eq(risks.projectId, projectId));

  return updatedRisks.map((r) => {
    // Extract evidence/description
    const match = detected.find((d) => d.title === r.title);
    return {
      id: r.id,
      projectId: r.projectId,
      taskId: r.taskId,
      title: r.title,
      description: r.description || "",
      evidence: match?.evidence || [
        `Risk detected on ${r.createdAt.slice(0, 10)}`,
        `Severity level: ${r.impact.toUpperCase()}`,
      ],
      recommendation: r.mitigation || "Review and take mitigation action.",
      probability: r.probability,
      impact: r.impact,
      source: (r.source as "ai" | "manual") || "ai",
      status: r.status,
      issueType: match?.issueType ?? ("sprint_delivery" as const),
      riskDomain: (r.riskDomain ?? match?.riskDomain ?? "technical") as RiskDomainValue,
      createdAt: r.createdAt,
    };
  });
}
