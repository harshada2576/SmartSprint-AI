"use client";

import * as React from "react";
import Link from "next/link";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUser } from "@/lib/auth/use-user";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  Play,
  Plus,
  Save,
  Search,
  Sliders,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  buildQuery,
  normalizeProject,
  normalizeSprint,
  normalizeTask,
  useCollection,
  type ProjectItem,
  type SprintItem,
  type TaskItem,
} from "@/lib/api-client";

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: { message: string };
}

async function apiPost<T = any>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: { message: json?.error?.message || "Request failed" } };
    }
    return { ok: true, data: json.data as T };
  } catch (e: any) {
    return { ok: false, error: { message: e?.message || "Network error" } };
  }
}

async function apiPatch<T = any>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: { message: json?.error?.message || "Request failed" } };
    }
    return { ok: true, data: json.data as T };
  } catch (e: any) {
    return { ok: false, error: { message: e?.message || "Network error" } };
  }
}

async function apiDelete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: { message: json?.error?.message || "Request failed" } };
    }
    return { ok: true, data: json.data as T };
  } catch (e: any) {
    return { ok: false, error: { message: e?.message || "Network error" } };
  }
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
}

interface SprintSummary {
  sprintId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  totalTasks: number;
  completedTasksCount: number;
  incompleteTasksCount: number;
  blockedTasksCount: number;
  plannedPoints: number;
  completedPoints: number;
  completionRate: number;
  incompleteActionHandled: string;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export default function SprintPlanningPage() {
  const { user, isStaff } = useUser();

  // 1. Projects
  const { items: projects, isLoading: projectsLoading } = useCollection<ProjectItem>(
    "/api/projects",
    normalizeProject,
    React.useMemo(() => buildQuery({ page: 1, pageSize: 50 }), [])
  );

  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");

  React.useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // 2. Sprints for selected project
  const sprintsQuery = React.useMemo(() => {
    if (!selectedProjectId) return "";
    return buildQuery({ projectId: selectedProjectId, page: 1, pageSize: 50 });
  }, [selectedProjectId]);

  const {
    items: sprints,
    isLoading: sprintsLoading,
    retry: reloadSprints,
  } = useCollection<SprintItem>("/api/sprints", normalizeSprint, sprintsQuery);

  const [selectedSprintId, setSelectedSprintId] = React.useState<string>("");

  React.useEffect(() => {
    if (sprints.length > 0) {
      const activeOrFirst = sprints.find((s) => s.status === "active") ?? sprints[0];
      setSelectedSprintId((prev) => (sprints.some((s) => s.id === prev) ? prev : activeOrFirst.id));
    } else {
      setSelectedSprintId("");
    }
  }, [sprints]);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) ?? null;

  // 3. Tasks for selected project
  const tasksQuery = React.useMemo(() => {
    if (!selectedProjectId) return "";
    return buildQuery({ projectId: selectedProjectId, page: 1, pageSize: 100 });
  }, [selectedProjectId]);

  const {
    items: tasks,
    isLoading: tasksLoading,
    retry: reloadTasks,
  } = useCollection<TaskItem>("/api/tasks", normalizeTask, tasksQuery);

  // 4. Team members
  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([]);
  React.useEffect(() => {
    fetch("/api/team")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setTeamMembers(data.data || []))
      .catch(() => setTeamMembers([]));
  }, []);

  // Form states for selected sprint
  const [sprintName, setSprintName] = React.useState("");
  const [sprintGoal, setSprintGoal] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [capacityPoints, setCapacityPoints] = React.useState<number>(40);
  const [capacityHours, setCapacityHours] = React.useState<number>(80);

  React.useEffect(() => {
    if (selectedSprint) {
      setSprintName(selectedSprint.name);
      setSprintGoal(selectedSprint.goal || "");
      setStartDate(toDateInput(selectedSprint.startDate));
      setEndDate(toDateInput(selectedSprint.endDate));
      setCapacityPoints(selectedSprint.capacityPoints ?? selectedSprint.totalPoints ?? 40);
      setCapacityHours(selectedSprint.capacityHours ?? 80);
    }
  }, [selectedSprint]);

  // Create sprint modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [newSprintName, setNewSprintName] = React.useState("");
  const [newSprintGoal, setNewSprintGoal] = React.useState("");
  const [newStartDate, setNewStartDate] = React.useState("");
  const [newEndDate, setNewEndDate] = React.useState("");
  const [newCapacityPoints, setNewCapacityPoints] = React.useState<number>(30);
  const [newCapacityHours, setNewCapacityHours] = React.useState<number>(60);
  const [creatingSprint, setCreatingSprint] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Completion modal state
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
  const [incompleteAction, setIncompleteAction] = React.useState<"move_to_backlog" | "leave_unassigned">("move_to_backlog");
  const [completingSprint, setCompletingSprint] = React.useState(false);
  const [sprintSummary, setSprintSummary] = React.useState<SprintSummary | null>(null);

  // UI state
  const [busyTasks, setBusyTasks] = React.useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingPlan, setSavingPlan] = React.useState(false);
  const [startingSprint, setStartingSprint] = React.useState(false);

  // Filters for backlog
  const [searchQuery, setSearchQuery] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");

  // Partition tasks: Available Backlog vs Selected for Sprint
  const availableBacklog = React.useMemo(() => {
    return tasks.filter((t) => {
      // Must not belong to the current sprint
      if (selectedSprintId && t.sprintId === selectedSprintId) return false;
      // Filter by search
      if (searchQuery.trim() && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      // Filter by priority
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      // Filter by assignee
      if (assigneeFilter !== "all") {
        if (assigneeFilter === "unassigned" && t.assigneeId) return false;
        if (assigneeFilter !== "unassigned" && t.assigneeId !== assigneeFilter) return false;
      }
      return true;
    });
  }, [tasks, selectedSprintId, searchQuery, priorityFilter, assigneeFilter]);

  const selectedSprintTasks = React.useMemo(() => {
    if (!selectedSprintId) return [];
    return tasks.filter((t) => t.sprintId === selectedSprintId);
  }, [tasks, selectedSprintId]);

  // Capacity calculations
  const usedPoints = React.useMemo(() => {
    return selectedSprintTasks.reduce((sum, t) => sum + (t.points || 0), 0);
  }, [selectedSprintTasks]);

  const usedHours = React.useMemo(() => {
    return selectedSprintTasks.reduce((sum, t) => sum + (t.estimatedHours || (t.points ? t.points * 4 : 4)), 0);
  }, [selectedSprintTasks]);

  const remainingPoints = capacityPoints - usedPoints;
  const remainingHours = capacityHours - usedHours;
  const capacityPercent = capacityPoints > 0 ? Math.round((usedPoints / capacityPoints) * 100) : 0;
  const isOverCapacity = usedPoints > capacityPoints;

  // Handler: Add task to sprint
  const handleAddTaskToSprint = async (taskId: string) => {
    if (!selectedSprintId) return;
    setBusyTasks((prev) => ({ ...prev, [taskId]: true }));
    try {
      const res = await apiPost(`/api/sprints/${selectedSprintId}/tasks`, { taskId });
      if (res.ok) {
        setFeedback({ type: "success", message: "Task added to sprint" });
        reloadTasks();
        reloadSprints();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to add task" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error adding task" });
    } finally {
      setBusyTasks((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  // Handler: Remove task from sprint
  const handleRemoveTaskFromSprint = async (taskId: string) => {
    if (!selectedSprintId) return;
    setBusyTasks((prev) => ({ ...prev, [taskId]: true }));
    try {
      const res = await apiDelete(`/api/sprints/${selectedSprintId}/tasks/${taskId}`);
      if (res.ok) {
        setFeedback({ type: "success", message: "Task removed from sprint" });
        reloadTasks();
        reloadSprints();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to remove task" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error removing task" });
    } finally {
      setBusyTasks((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  // Handler: Assign developer
  const handleAssignDeveloper = async (taskId: string, newAssigneeId: string) => {
    setBusyTasks((prev) => ({ ...prev, [taskId]: true }));
    try {
      const val = newAssigneeId === "unassigned" ? null : newAssigneeId;
      const res = await apiPatch(`/api/tasks/${taskId}`, { assigneeId: val });
      if (res.ok) {
        setFeedback({ type: "success", message: "Assignee updated" });
        reloadTasks();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to update assignee" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error updating assignee" });
    } finally {
      setBusyTasks((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  // Handler: Save Sprint Plan
  const handleSavePlan = async () => {
    if (!selectedSprintId) return;
    setSavingPlan(true);
    setFeedback(null);
    try {
      const res = await apiPatch(`/api/sprints/${selectedSprintId}`, {
        name: sprintName.trim(),
        goal: sprintGoal.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        capacityPoints: Number(capacityPoints),
        capacityHours: Number(capacityHours),
      });
      if (res.ok) {
        setFeedback({ type: "success", message: "Sprint plan saved successfully" });
        reloadSprints();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to save plan" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error saving plan" });
    } finally {
      setSavingPlan(false);
    }
  };

  // Handler: Start Sprint
  const handleStartSprint = async () => {
    if (!selectedSprintId) return;
    if (selectedSprintTasks.length === 0) {
      setFeedback({ type: "error", message: "Cannot start a sprint with no tasks. Add at least one task." });
      return;
    }
    setStartingSprint(true);
    setFeedback(null);
    try {
      const res = await apiPost(`/api/sprints/${selectedSprintId}/start`, {});
      if (res.ok) {
        setFeedback({ type: "success", message: `Sprint "${sprintName}" is now ACTIVE!` });
        reloadSprints();
        reloadTasks();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to start sprint" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error starting sprint" });
    } finally {
      setStartingSprint(false);
    }
  };

  // Handler: Create Sprint Submit
  const handleCreateSprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setCreateError("Please select a project first");
      return;
    }
    if (!newSprintName.trim()) {
      setCreateError("Sprint name is required");
      return;
    }
    setCreatingSprint(true);
    setCreateError(null);
    try {
      const res = await apiPost<{ id: string }>("/api/sprints", {
        projectId: selectedProjectId,
        name: newSprintName.trim(),
        goal: newSprintGoal.trim() || null,
        startDate: newStartDate || null,
        endDate: newEndDate || null,
        capacityPoints: Number(newCapacityPoints) || 30,
        capacityHours: Number(newCapacityHours) || 60,
        status: "planning",
      });
      if (res.ok && res.data) {
        setIsCreateModalOpen(false);
        setNewSprintName("");
        setNewSprintGoal("");
        setNewStartDate("");
        setNewEndDate("");
        setFeedback({ type: "success", message: `Sprint "${newSprintName}" created!` });
        reloadSprints();
        setSelectedSprintId(res.data.id);
      } else {
        setCreateError(res.error?.message || "Failed to create sprint");
      }
    } catch {
      setCreateError("Network error creating sprint");
    } finally {
      setCreatingSprint(false);
    }
  };

  // Handler: Complete Sprint Submit
  const handleCompleteSprintSubmit = async () => {
    if (!selectedSprintId) return;
    setCompletingSprint(true);
    try {
      const res = await apiPost<SprintSummary>(`/api/sprints/${selectedSprintId}/complete`, {
        incompleteAction,
      });
      if (res.ok && res.data) {
        setSprintSummary(res.data);
        setIsCompleteModalOpen(false);
        reloadSprints();
        reloadTasks();
        setFeedback({ type: "success", message: "Sprint successfully completed!" });
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Failed to complete sprint" });
        setIsCompleteModalOpen(false);
      }
    } catch {
      setFeedback({ type: "error", message: "Network error completing sprint" });
      setIsCompleteModalOpen(false);
    } finally {
      setCompletingSprint(false);
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <AuthenticatedLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Page Header */}
        <PageHeader
          title="Sprint Planning"
          description="Plan sprints from the product backlog, balance capacity, assign developers, and manage sprint lifecycles."
          actions={
            <div className="flex items-center gap-3">
              {selectedSprint?.status === "active" && (
                <Link href="/sprint-board">
                  <Button variant="outline" className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-primary" />
                    Open Sprint Board
                  </Button>
                </Link>
              )}
              {isStaff && (
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Sprint
                </Button>
              )}
            </div>
          }
        />

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between shadow-sm animate-in fade-in duration-200 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
            }`}
          >
            <div className="flex items-center gap-3">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Project & Sprint Selection Bar */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  disabled={projectsLoading || projects.length === 0}
                >
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                  {projects.length === 0 && <option value="">No projects available</option>}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Sprint
                </label>
                <select
                  value={selectedSprintId}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  disabled={sprintsLoading || sprints.length === 0}
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status.toUpperCase()})
                    </option>
                  ))}
                  {sprints.length === 0 && <option value="">No sprints created yet</option>}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Sprint Status
                </label>
                <div className="h-10 flex items-center">
                  {selectedSprint ? (
                    <Badge
                      variant="outline"
                      className={`text-xs uppercase font-semibold px-3 py-1 ${
                        selectedSprint.status === "active"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : selectedSprint.status === "completed"
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      }`}
                    >
                      {selectedSprint.status}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedSprint?.status === "planning" && (
                  <Button
                    onClick={handleStartSprint}
                    disabled={startingSprint || selectedSprintTasks.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-medium"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {startingSprint ? "Starting..." : "Start Sprint"}
                  </Button>
                )}
                {selectedSprint?.status === "active" && (
                  <Button
                    onClick={() => setIsCompleteModalOpen(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Complete Sprint
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedSprint ? (
          <>
            {/* Sprint Details & Capacity Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sprint Parameters Form */}
              <Card className="lg:col-span-2 border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Sprint Configuration</CardTitle>
                      <CardDescription className="text-xs">
                        Define sprint dates, goals, and target capacity.
                      </CardDescription>
                    </div>
                    {isStaff && (
                      <Button
                        size="sm"
                        onClick={handleSavePlan}
                        disabled={savingPlan}
                        className="flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingPlan ? "Saving..." : "Save Sprint Plan"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Sprint Name
                      </label>
                      <Input
                        value={sprintName}
                        onChange={(e) => setSprintName(e.target.value)}
                        placeholder="e.g. Sprint 1"
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Sprint Goal
                      </label>
                      <Input
                        value={sprintGoal}
                        onChange={(e) => setSprintGoal(e.target.value)}
                        placeholder="e.g. Complete checkout and payment flow"
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Start Date
                      </label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        End Date
                      </label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Capacity Points
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={capacityPoints}
                        onChange={(e) => setCapacityPoints(Number(e.target.value))}
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Capacity Hours
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={capacityHours}
                        onChange={(e) => setCapacityHours(Number(e.target.value))}
                        disabled={!isStaff || selectedSprint.status === "completed"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Real Capacity Tracker Card */}
              <Card
                className={`border-border/60 ${
                  isOverCapacity
                    ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/10"
                    : "bg-card/80"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Flame className={`w-4 h-4 ${isOverCapacity ? "text-amber-500" : "text-primary"}`} />
                      Sprint Capacity
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-xs font-semibold ${
                        isOverCapacity
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "bg-primary/10 text-primary border-primary/30"
                      }`}
                    >
                      {capacityPercent}%
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Real-time story points & hours usage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress bar */}
                  <div className="w-full bg-muted/60 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOverCapacity
                          ? "bg-amber-500"
                          : capacityPercent >= 80
                          ? "bg-emerald-500"
                          : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                    />
                  </div>

                  {/* Warning banner */}
                  {isOverCapacity && (
                    <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>WARNING:</strong> Sprint capacity exceeded by{" "}
                        <strong>{usedPoints - capacityPoints} points</strong> ({usedHours - capacityHours} hrs).
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                      <span className="text-muted-foreground block mb-0.5">Capacity</span>
                      <span className="text-sm font-bold">{capacityPoints} pts / {capacityHours} hrs</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                      <span className="text-muted-foreground block mb-0.5">Selected</span>
                      <span className="text-sm font-bold text-primary">{usedPoints} pts / {usedHours} hrs</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                      <span className="text-muted-foreground block mb-0.5">Remaining</span>
                      <span
                        className={`text-sm font-bold ${
                          remainingPoints < 0 ? "text-amber-500" : "text-emerald-500"
                        }`}
                      >
                        {remainingPoints} pts / {remainingHours} hrs
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                      <span className="text-muted-foreground block mb-0.5">Selected Tasks</span>
                      <span className="text-sm font-bold">{selectedSprintTasks.length} tasks</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Split Planning Workspace: Available Backlog vs Selected for Sprint */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Available Backlog */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-muted-foreground" />
                      Available Backlog
                      <Badge variant="secondary" className="text-xs">
                        {availableBacklog.length}
                      </Badge>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      Click task to allocate
                    </span>
                  </div>

                  {/* Backlog Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
                      <Input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 text-xs h-8"
                      />
                    </div>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="all">All Priorities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="all">All Assignees</option>
                      <option value="unassigned">Unassigned</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>

                <CardContent className="p-3 space-y-2 max-h-[620px] overflow-y-auto">
                  {tasksLoading && availableBacklog.length === 0 ? (
                    <div className="space-y-2 p-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : availableBacklog.length === 0 ? (
                    <EmptyState
                      title="No backlog tasks"
                      description={
                        searchQuery || priorityFilter !== "all"
                          ? "No tasks match your filters."
                          : "No tasks are currently available for sprint planning."
                      }
                      className="py-8"
                    />
                  ) : (
                    availableBacklog.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg border border-border/50 bg-card hover:border-primary/40 transition-colors flex flex-col gap-2 group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={false}
                              disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                              onChange={() => handleAddTaskToSprint(task.id)}
                              className="mt-1 rounded border-input cursor-pointer focus:ring-primary h-4 w-4"
                              title="Add to sprint"
                            />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/tasks/${task.id}`}
                                className="text-sm font-medium hover:text-primary hover:underline line-clamp-1"
                              >
                                {task.title}
                              </Link>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                            onClick={() => handleAddTaskToSprint(task.id)}
                            className="h-7 text-xs px-2.5 opacity-80 group-hover:opacity-100"
                          >
                            + Add
                          </Button>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 uppercase ${
                                task.priority === "critical"
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : task.priority === "high"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {task.priority}
                            </Badge>
                            <span className="font-semibold text-foreground/80">
                              {task.points ?? 0} pts
                            </span>
                            <span className="text-muted-foreground">
                              {task.estimatedHours ?? (task.points ? task.points * 4 : 4)} hrs
                            </span>
                          </div>

                          {/* Assignee selection */}
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3 h-3 text-muted-foreground" />
                            <select
                              value={task.assigneeId || "unassigned"}
                              onChange={(e) => handleAssignDeveloper(task.id, e.target.value)}
                              disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                              className="text-[11px] h-6 px-1.5 rounded border border-input bg-background/50 hover:bg-background cursor-pointer"
                            >
                              <option value="unassigned">Unassigned</option>
                              {teamMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Right Column: Selected for Sprint */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        Selected for {selectedSprint.name}
                        <Badge variant="default" className="text-xs bg-primary text-primary-foreground">
                          {selectedSprintTasks.length}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Total {usedPoints} / {capacityPoints} pts ({usedHours} hrs)
                      </CardDescription>
                    </div>

                    {selectedSprint.status === "planning" && (
                      <Button
                        size="sm"
                        onClick={handleStartSprint}
                        disabled={startingSprint || selectedSprintTasks.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Start Sprint
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-3 space-y-2 max-h-[620px] overflow-y-auto">
                  {selectedSprintTasks.length === 0 ? (
                    <EmptyState
                      title="No tasks in this sprint"
                      description="Select tasks from the backlog on the left to include them in this sprint."
                      className="py-12"
                    />
                  ) : (
                    selectedSprintTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg border border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors flex flex-col gap-2 group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={true}
                              disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                              onChange={() => handleRemoveTaskFromSprint(task.id)}
                              className="mt-1 rounded border-input cursor-pointer focus:ring-primary h-4 w-4 text-primary"
                              title="Remove from sprint"
                            />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/tasks/${task.id}`}
                                className="text-sm font-medium hover:text-primary hover:underline line-clamp-1"
                              >
                                {task.title}
                              </Link>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                            onClick={() => handleRemoveTaskFromSprint(task.id)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                            title="Remove from sprint"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 uppercase ${
                                task.priority === "critical"
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : task.priority === "high"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {task.priority}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 uppercase bg-background"
                            >
                              {task.columnStatus}
                            </Badge>
                            <span className="font-semibold text-foreground/80">
                              {task.points ?? 0} pts
                            </span>
                            <span className="text-muted-foreground">
                              {task.estimatedHours ?? (task.points ? task.points * 4 : 4)} hrs
                            </span>
                          </div>

                          {/* Assignee selection */}
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-primary" />
                            <select
                              value={task.assigneeId || "unassigned"}
                              onChange={(e) => handleAssignDeveloper(task.id, e.target.value)}
                              disabled={busyTasks[task.id] || selectedSprint.status === "completed"}
                              className="text-[11px] h-6 px-1.5 rounded border border-input bg-background/80 hover:bg-background cursor-pointer"
                            >
                              <option value="unassigned">Unassigned</option>
                              {teamMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="p-8 text-center border-dashed">
            <EmptyState
              title="No Sprints in this Project"
              description="Create your first sprint to start allocating backlog items and tracking velocity."
              action={
                isStaff
                  ? {
                      label: "Create First Sprint",
                      onClick: () => setIsCreateModalOpen(true),
                    }
                  : undefined
              }
            />
          </Card>
        )}

        {/* Modal: Create Sprint */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-semibold">Create New Sprint</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {createError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSprintSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Sprint Name *
                  </label>
                  <Input
                    required
                    value={newSprintName}
                    onChange={(e) => setNewSprintName(e.target.value)}
                    placeholder="e.g. Sprint 1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Sprint Goal
                  </label>
                  <Input
                    value={newSprintGoal}
                    onChange={(e) => setNewSprintGoal(e.target.value)}
                    placeholder="e.g. Authentication and restaurant management"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Start Date *
                    </label>
                    <Input
                      type="date"
                      required
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      End Date *
                    </label>
                    <Input
                      type="date"
                      required
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Capacity Points
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={newCapacityPoints}
                      onChange={(e) => setNewCapacityPoints(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Capacity Hours
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={newCapacityHours}
                      onChange={(e) => setNewCapacityHours(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creatingSprint}>
                    {creatingSprint ? "Creating..." : "Create Sprint"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Complete Sprint Confirmation */}
        {isCompleteModalOpen && selectedSprint && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-500" />
                  Complete {selectedSprint.name}
                </h3>
                <button
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Sprint has <strong>{selectedSprintTasks.length} planned tasks</strong>:
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                    {selectedSprintTasks.filter((t) => t.columnStatus === "done").length} Completed
                  </div>
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold">
                    {selectedSprintTasks.filter((t) => t.columnStatus !== "done").length} Incomplete
                  </div>
                  <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-semibold">
                    {selectedSprintTasks.filter((t) => t.isBlocked || t.columnStatus === "blocked").length} Blocked
                  </div>
                </div>

                <div className="pt-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                    What should happen to incomplete tasks?
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/40 cursor-pointer">
                      <input
                        type="radio"
                        name="incompleteAction"
                        value="move_to_backlog"
                        checked={incompleteAction === "move_to_backlog"}
                        onChange={() => setIncompleteAction("move_to_backlog")}
                        className="text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="font-medium text-xs block">Move to Backlog (Recommended)</span>
                        <span className="text-[11px] text-muted-foreground">
                          Resets status to backlog so they can be re-planned in upcoming sprints.
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/40 cursor-pointer">
                      <input
                        type="radio"
                        name="incompleteAction"
                        value="leave_unassigned"
                        checked={incompleteAction === "leave_unassigned"}
                        onChange={() => setIncompleteAction("leave_unassigned")}
                        className="text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="font-medium text-xs block">Leave Unassigned</span>
                        <span className="text-[11px] text-muted-foreground">
                          Detaches them from this sprint while keeping their current in-flight statuses.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCompleteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCompleteSprintSubmit}
                  disabled={completingSprint}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {completingSprint ? "Completing..." : "Confirm & Complete Sprint"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Sprint Summary Report */}
        {sprintSummary && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  Sprint Summary Report
                </h3>
                <button
                  onClick={() => setSprintSummary(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="text-base font-bold text-foreground">{sprintSummary.name}</h4>
                  <p className="text-xs text-muted-foreground">{sprintSummary.goal || "No goal specified"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {toDateInput(sprintSummary.startDate)} → {toDateInput(sprintSummary.endDate)}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                    <span className="text-[10px] uppercase text-muted-foreground block">Completion</span>
                    <span className="text-base font-bold text-emerald-500">
                      {sprintSummary.completionRate}%
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                    <span className="text-[10px] uppercase text-muted-foreground block">Completed Pts</span>
                    <span className="text-base font-bold text-foreground">
                      {sprintSummary.completedPoints} / {sprintSummary.plannedPoints}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                    <span className="text-[10px] uppercase text-muted-foreground block">Done Tasks</span>
                    <span className="text-base font-bold text-foreground">
                      {sprintSummary.completedTasksCount} / {sprintSummary.totalTasks}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                    <span className="text-[10px] uppercase text-muted-foreground block">Blocked</span>
                    <span className="text-base font-bold text-red-500">
                      {sprintSummary.blockedTasksCount}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                  Sprint completed. {sprintSummary.incompleteTasksCount} incomplete tasks were processed via{" "}
                  <strong>{sprintSummary.incompleteActionHandled}</strong>.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button onClick={() => setSprintSummary(null)}>
                  Close Summary
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
