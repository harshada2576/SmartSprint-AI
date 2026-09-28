import { describe, it, expect } from "vitest";
import { z } from "zod";
import { aiProjectBreakdownSchema } from "@/schemas/ai-breakdown";

describe("SmartSprint AI MVP Core Requirements", () => {
  // ==========================================
  // 1. TASK PROGRESS & BLOCKER VALIDATION
  // ==========================================
  describe("Task Progress & Blocker Constraints", () => {
    const taskProgressSchema = z.object({
      progressPercent: z.number().int().min(0).max(100),
      isBlocked: z.boolean(),
      blockedReason: z.string().nullable().optional(),
    });

    it("accepts valid progress percent between 0 and 100", () => {
      expect(taskProgressSchema.safeParse({ progressPercent: 0, isBlocked: false }).success).toBe(true);
      expect(taskProgressSchema.safeParse({ progressPercent: 50, isBlocked: false }).success).toBe(true);
      expect(taskProgressSchema.safeParse({ progressPercent: 100, isBlocked: false }).success).toBe(true);
    });

    it("rejects invalid progress percent (< 0 or > 100)", () => {
      expect(taskProgressSchema.safeParse({ progressPercent: -5, isBlocked: false }).success).toBe(false);
      expect(taskProgressSchema.safeParse({ progressPercent: 105, isBlocked: false }).success).toBe(false);
    });

    it("accepts blocked task with reason", () => {
      const res = taskProgressSchema.safeParse({
        progressPercent: 25,
        isBlocked: true,
        blockedReason: "Waiting for third-party OAuth client ID",
      });
      expect(res.success).toBe(true);
    });
  });

  // ==========================================
  // 2. SPRINT PLANNING & CAPACITY LOGIC
  // ==========================================
  describe("Sprint Capacity & Planning Calculation", () => {
    function calculateSprintCapacity(capacityPoints: number, tasks: Array<{ points: number; isBlocked?: boolean }>) {
      const usedPoints = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
      const remainingPoints = capacityPoints - usedPoints;
      const isExceeded = usedPoints > capacityPoints;
      const percentage = capacityPoints > 0 ? Math.round((usedPoints / capacityPoints) * 100) : 0;

      return {
        capacityPoints,
        usedPoints,
        remainingPoints,
        isExceeded,
        percentage,
      };
    }

    it("calculates remaining points and percentage accurately", () => {
      const tasks = [
        { points: 8 },
        { points: 5 },
        { points: 3 },
      ];
      const stats = calculateSprintCapacity(40, tasks);
      expect(stats.usedPoints).toBe(16);
      expect(stats.remainingPoints).toBe(24);
      expect(stats.percentage).toBe(40);
      expect(stats.isExceeded).toBe(false);
    });

    it("flags capacity warnings when selected work exceeds capacity", () => {
      const tasks = [
        { points: 20 },
        { points: 15 },
        { points: 10 },
      ];
      const stats = calculateSprintCapacity(40, tasks);
      expect(stats.usedPoints).toBe(45);
      expect(stats.remainingPoints).toBe(-5);
      expect(stats.isExceeded).toBe(true);
      expect(stats.percentage).toBe(113);
    });

    it("validates sprint state transition from planning to active", () => {
      function canStartSprint(sprint: { status: string; startDate: string; endDate: string; taskCount: number }) {
        if (sprint.status !== "planning") return { allowed: false, error: "Only planned sprints can be started" };
        if (sprint.taskCount === 0) return { allowed: false, error: "Sprint must have at least one task" };
        if (new Date(sprint.endDate) < new Date(sprint.startDate)) {
          return { allowed: false, error: "End date must be after start date" };
        }
        return { allowed: true };
      }

      expect(canStartSprint({
        status: "planning",
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        taskCount: 5,
      }).allowed).toBe(true);

      expect(canStartSprint({
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        taskCount: 5,
      }).allowed).toBe(false);

      expect(canStartSprint({
        status: "planning",
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        taskCount: 0,
      }).allowed).toBe(false);
    });
  });

  // ==========================================
  // 3. AI PROJECT BREAKDOWN VALIDATION
  // ==========================================
  describe("AI Project Breakdown Schema Validation", () => {
    it("validates well-formed LLM breakdown JSON", () => {
      const validPayload = {
        projectSummary: "Food Delivery Platform connecting diners with local chefs",
        epics: [
          {
            name: "Ordering Flow",
            description: "Diner cart, menu, and payment",
            tasks: [
              {
                title: "Build checkout form",
                description: "Handle address and billing",
                priority: "high",
                estimatedHours: 8,
                acceptanceCriteria: ["User can enter address", "Address is geocoded"],
              },
            ],
          },
        ],
        suggestedSprints: [
          {
            name: "Sprint 1",
            goal: "MVP Checkout",
            taskIndexes: [0],
          },
        ],
      };

      const result = aiProjectBreakdownSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("rejects malformed LLM breakdown missing tasks or epics", () => {
      const invalidPayload = {
        projectSummary: "Missing epics array",
      };

      const result = aiProjectBreakdownSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================
  // 4. DETERMINISTIC RISK ENGINE RULES
  // ==========================================
  describe("AI Risk Engine Deterministic Evaluation", () => {
    const now = new Date("2026-09-27T12:00:00Z");

    it("detects Rule A: Task due within 48h and progress < 50%", () => {
      const task = {
        id: "t1",
        title: "Database Migration",
        column_status: "inProgress",
        progress_percent: 30,
        due_date: new Date("2026-09-28T12:00:00Z").toISOString(), // 24 hours away
        is_blocked: false,
        blocked_at: null,
      };

      const hoursUntilDue = (new Date(task.due_date).getTime() - now.getTime()) / (1000 * 60 * 60);
      const isRuleAMatch = hoursUntilDue > 0 && hoursUntilDue <= 48 && task.progress_percent < 50;

      expect(isRuleAMatch).toBe(true);
    });

    it("detects Rule B: Task blocked for > 24 hours", () => {
      const task = {
        id: "t2",
        title: "Payment Gateway",
        column_status: "blocked",
        is_blocked: true,
        blocked_at: new Date("2026-09-26T08:00:00Z").toISOString(), // 28 hours ago
      };

      const blockedHours = (now.getTime() - new Date(task.blocked_at).getTime()) / (1000 * 60 * 60);
      const isRuleBMatch = task.is_blocked && blockedHours >= 24;

      expect(isRuleBMatch).toBe(true);
    });

    it("detects Rule C: Developer with > 5 active tasks", () => {
      const devTasks = [
        { id: "1", column_status: "inProgress" },
        { id: "2", column_status: "inProgress" },
        { id: "3", column_status: "todo" },
        { id: "4", column_status: "review" },
        { id: "5", column_status: "todo" },
        { id: "6", column_status: "inProgress" },
      ];

      const activeCount = devTasks.filter((t) => t.column_status !== "done").length;
      expect(activeCount > 5).toBe(true);
    });

    it("detects Rule D: Task overdue", () => {
      const task = {
        id: "t4",
        title: "API Spec",
        column_status: "inProgress",
        due_date: new Date("2026-09-25T12:00:00Z").toISOString(), // 2 days ago
      };

      const isOverdue = new Date(task.due_date) < now && task.column_status !== "done";
      expect(isOverdue).toBe(true);
    });
  });

  // ==========================================
  // 5. RBAC PERMISSIONS MATRIX
  // ==========================================
  describe("Role-Based Access Control Boundaries", () => {
    type Role = "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER";

    function canPerformAction(role: Role, action: "manage_users" | "create_project" | "plan_sprint" | "update_task_progress" | "reassign_tasks") {
      switch (action) {
        case "manage_users":
          return role === "ADMIN";
        case "create_project":
        case "plan_sprint":
          return role === "ADMIN" || role === "PROJECT_MANAGER";
        case "update_task_progress":
          return true; // All roles can update task progress
        case "reassign_tasks":
          return role === "ADMIN" || role === "PROJECT_MANAGER";
        default:
          return false;
      }
    }

    it("enforces Developer restrictions", () => {
      expect(canPerformAction("DEVELOPER", "manage_users")).toBe(false);
      expect(canPerformAction("DEVELOPER", "create_project")).toBe(false);
      expect(canPerformAction("DEVELOPER", "plan_sprint")).toBe(false);
      expect(canPerformAction("DEVELOPER", "reassign_tasks")).toBe(false);
      expect(canPerformAction("DEVELOPER", "update_task_progress")).toBe(true);
    });

    it("allows Project Manager to plan sprints and reassign tasks", () => {
      expect(canPerformAction("PROJECT_MANAGER", "manage_users")).toBe(false);
      expect(canPerformAction("PROJECT_MANAGER", "create_project")).toBe(true);
      expect(canPerformAction("PROJECT_MANAGER", "plan_sprint")).toBe(true);
      expect(canPerformAction("PROJECT_MANAGER", "reassign_tasks")).toBe(true);
    });

    it("allows Admin to manage platform users", () => {
      expect(canPerformAction("ADMIN", "manage_users")).toBe(true);
    });
  });
});
