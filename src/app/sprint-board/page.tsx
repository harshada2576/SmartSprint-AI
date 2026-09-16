"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PriorityChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  LayoutGrid,
  List,
  Plus,
  Calendar,
  Clock,
  Target,
  MoreHorizontal,
  Filter,
  ChevronLeft,
  ChevronRight,
  Play,
  Flag,
  AlertCircle,
} from "lucide-react";
import {
  ApiError,
  buildQuery,
  normalizeSprint,
  normalizeTask,
  patchJson,
  useCollection,
  type SprintItem,
  type TaskItem,
} from "@/lib/api-client";
import { Select } from "@/components/ui/Select";
import { formatDate, formatRelativeTime } from "@/lib/utils";

const SPRINTS_PAGE_SIZE = 50;
// Bounded board fetch: one page of at most 100 tasks, grouped client-side by
// column_status. Full server pagination still applies (see footer note).
const BOARD_PAGE_SIZE = 100;

// Kanban columns mirror the backend task statuses (see TASK_STATUSES).
const COLUMNS = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "To Do" },
  { id: "inProgress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "testing", title: "Testing" },
  { id: "done", title: "Done" },
];

const MOVE_OPTIONS = COLUMNS.map((column) => ({
  value: column.id,
  label: column.title,
}));

function formatSprintDate(value: string | null): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

function remainingLabel(sprint: SprintItem): string {
  if (!sprint.endDate) return "No due date";
  const end = new Date(sprint.endDate).getTime();
  if (Number.isNaN(end)) return "—";
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Ends today";
  return `${days} days left`;
}

function sprintProgress(sprint: SprintItem): number {
  if (
    sprint.totalPoints !== null &&
    sprint.totalPoints > 0 &&
    sprint.completedPoints !== null
  ) {
    return Math.round((sprint.completedPoints / sprint.totalPoints) * 100);
  }
  return sprint.status === "completed" ? 100 : 0;
}

function assigneeInitials(assigneeId: string | null): string {
  if (!assigneeId) return "–";
  return assigneeId.slice(0, 2).toUpperCase();
}

function formatUpdated(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

export default function SprintBoardPage() {
  const router = useRouter();
  const [view, setView] = React.useState<"kanban" | "list">("kanban");
  const [sprintIndex, setSprintIndex] = React.useState(0);

  const sprintsQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: SPRINTS_PAGE_SIZE }),
    [],
  );
  const {
    items: sprints,
    error: sprintsError,
    isLoading: sprintsLoading,
    retry: retrySprints,
  } = useCollection<SprintItem>("/api/sprints", normalizeSprint, sprintsQuery);

  const selectedSprint =
    sprints.length === 0
      ? null
      : sprints[Math.min(sprintIndex, sprints.length - 1)] ?? null;

  const tasksQuery = React.useMemo(
    () =>
      selectedSprint
        ? buildQuery({
            sprintId: selectedSprint.id,
            page: 1,
            pageSize: BOARD_PAGE_SIZE,
          })
        : buildQuery({ page: 1, pageSize: 1 }),
    [selectedSprint],
  );
  const {
    items: tasks,
    pagination: tasksPagination,
    error: tasksError,
    isLoading: tasksLoading,
    retry: retryTasks,
  } = useCollection<TaskItem>("/api/tasks", normalizeTask, tasksQuery);

  // Optimistic status overrides: applied instantly on move, dropped on
  // failure (rollback) or once the refetch confirms the server value.
  const [statusOverrides, setStatusOverrides] = React.useState<
    Record<string, string>
  >({});
  const [movingIds, setMovingIds] = React.useState<Record<string, boolean>>(
    {},
  );
  const [moveError, setMoveError] = React.useState<string | null>(null);

  const boardTasks = selectedSprint
    ? tasks.map((task) =>
        statusOverrides[task.id] !== undefined
          ? { ...task, columnStatus: statusOverrides[task.id] as string }
          : task,
      )
    : [];
  const countFor = (columnId: string): number =>
    boardTasks.filter((task) => task.columnStatus === columnId).length;

  // Drop overrides the backend has confirmed so the server stays the source
  // of truth after every refetch.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded updater: returns prev unless a server-confirmed override exists
    setStatusOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const task of tasks) {
        if (next[task.id] === task.columnStatus) {
          delete next[task.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const moveTaskStatus = React.useCallback(
    async (taskId: string, newStatus: string) => {
      const current =
        tasks.find((task) => task.id === taskId)?.columnStatus ?? null;
      if (current === null || current === newStatus) return;
      setMoveError(null);
      setMovingIds((prev) => ({ ...prev, [taskId]: true }));
      setStatusOverrides((prev) => ({ ...prev, [taskId]: newStatus }));
      try {
        // `status` is the backend-accepted alias for `column_status`.
        await patchJson(
          `/api/tasks/${taskId}`,
          { status: newStatus },
          normalizeTask,
          { fallback: "Could not move task" },
        );
        retryTasks();
      } catch (error: unknown) {
        // Rollback the optimistic move, then reconcile with the backend.
        // Authorization failures (e.g. moving a task assigned to someone
        // else) arrive here verbatim — never hidden or bypassed.
        setStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        setMoveError(
          error instanceof ApiError
            ? error.message
            : "Could not move task. The board was refreshed to match the server.",
        );
        retryTasks();
      } finally {
        setMovingIds((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }
    },
    [tasks, retryTasks],
  );

  const showSprintsLoading = sprintsLoading && sprints.length === 0;
  const showTasksLoading =
    tasksLoading && selectedSprint !== null && tasks.length === 0;

  const retryAll = React.useCallback(() => {
    retrySprints();
    retryTasks();
  }, [retrySprints, retryTasks]);

  return (
    <AuthenticatedLayout>
      {showSprintsLoading ? (
        <>
          <PageHeader
            title="Sprint Board"
            description="Loading sprint…"
            breadcrumb={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Sprint Board" },
            ]}
          />
          <div className="grid sm:grid-cols-4 gap-4 mb-6">
            {[0, 1, 2, 3].map((index) => (
              <Card key={index}>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex-shrink-0 w-80 space-y-2">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ))}
          </div>
        </>
      ) : sprintsError !== null && sprints.length === 0 ? (
        <>
          <PageHeader
            title="Sprint Board"
            description="Track sprint work on the board"
            breadcrumb={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Sprint Board" },
            ]}
          />
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load sprints"
                description={sprintsError.message}
                action={{ label: "Try again", onClick: retryAll }}
              />
            </CardContent>
          </Card>
        </>
      ) : selectedSprint === null ? (
        <>
          <PageHeader
            title="Sprint Board"
            description="Track sprint work on the board"
            breadcrumb={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Sprint Board" },
            ]}
          />
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={Target}
                title="No sprints yet"
                description="Sprints in your projects will show up here."
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
      <PageHeader
        title={selectedSprint.name}
        description={selectedSprint.goal ?? "No sprint goal set."}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Sprint Board" },
        ]}
      >
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Calendar className="h-4 w-4" />
            <span>
              {formatSprintDate(selectedSprint.startDate)} - {formatSprintDate(selectedSprint.endDate)}
            </span>
          </div>
          <Badge variant="success" size="sm">
            {selectedSprint.status}
          </Badge>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">{remainingLabel(selectedSprint)}</span>
          </div>
        </div>
      </PageHeader>

      {/* Sprint Stats */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Progress</p>
                <p className="text-xl font-bold text-slate-900">{sprintProgress(selectedSprint)}%</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <Progress value={sprintProgress(selectedSprint)} size="sm" className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Points</p>
                <p className="text-xl font-bold text-slate-900">{selectedSprint.totalPoints ?? "—"}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <Flag className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{selectedSprint.completedPoints ?? "—"}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Play className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Remaining</p>
                <p className="text-xl font-bold text-slate-900">
                  {selectedSprint.totalPoints !== null && selectedSprint.completedPoints !== null
                    ? selectedSprint.totalPoints - selectedSprint.completedPoints
                    : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "kanban"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>
          <Button variant="secondary" leftIcon={<Filter className="h-4 w-4" />}>
            Filter
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSprintIndex((index) => Math.max(index - 1, 0))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700">
            {selectedSprint.name}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setSprintIndex((index) => Math.min(index + 1, sprints.length - 1))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {moveError !== null ? (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
        >
          <span>{moveError}</span>
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setMoveError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {showTasksLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex-shrink-0 w-80 space-y-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : tasksError !== null && boardTasks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load sprint tasks"
              description={tasksError.message}
              action={{ label: "Try again", onClick: retryTasks }}
            />
          </CardContent>
        </Card>
      ) : boardTasks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={LayoutGrid}
              title="No tasks in this sprint"
              description="Tasks assigned to this sprint will show up on the board."
            />
          </CardContent>
        </Card>
      ) : view === "kanban" ? (
        /* Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className="flex-shrink-0 w-80 bg-slate-50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900">{column.title}</h3>
                  <Badge variant="default" size="sm">
                    {countFor(column.id)}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Add task to ${column.title}`}
                  title={`Add task to ${column.title}`}
                  onClick={() =>
                    router.push(
                      `/tasks?create=1&sprintId=${encodeURIComponent(selectedSprint.id)}&status=${encodeURIComponent(column.id)}`,
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {boardTasks
                  .filter((task) => task.columnStatus === column.id)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="bg-white p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <p className="text-sm font-medium text-slate-900 mb-2">
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PriorityChip priority={task.priority} size="sm" />
                          <span className="text-xs text-slate-500">
                            {task.points ?? "—"}{task.points !== null ? " pts" : ""}
                          </span>
                        </div>
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {assigneeInitials(task.assigneeId)}
                        </div>
                      </div>
                      <div
                        className="mt-2 flex items-center gap-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="text-xs text-slate-500">Move to</span>
                        <Select
                          aria-label={`Move ${task.title} to status`}
                          options={MOVE_OPTIONS}
                          value={task.columnStatus}
                          disabled={movingIds[task.id] === true}
                          onChange={(event) => {
                            void moveTaskStatus(task.id, event.target.value);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/50">
                <tr>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Task
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Assignee
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Priority
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Points
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boardTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <td className="p-4">
                      <div>
                        <p className="font-mono text-xs text-slate-400">
                          {task.displayId}
                        </p>
                        <p className="font-medium text-slate-900">
                          {task.title}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      {task.assigneeId ? (
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {assigneeInitials(task.assigneeId)}
                        </div>
                        <span className="text-sm text-slate-600">
                          ID {task.assigneeId.slice(0, 8)}
                        </span>
                      </div>
                      ) : (
                        <span className="text-sm text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          task.columnStatus === "done"
                            ? "success"
                            : task.columnStatus === "inProgress"
                            ? "info"
                            : "default"
                        }
                        size="sm"
                      >
                        {task.columnStatus}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <PriorityChip priority={task.priority} size="sm" />
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {task.points ?? "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {formatUpdated(task.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {/* Board shows one page of up to 100 tasks; full pagination lives in
          the tasks API (`tasksPagination.total` overall in this sprint). */}
      {!showTasksLoading && tasksError === null && tasksPagination.total > BOARD_PAGE_SIZE ? (
        <p className="text-sm text-slate-500 mt-4">
          Showing {boardTasks.length} of {tasksPagination.total} tasks in this
          sprint. Refine filters to see more.
        </p>
      ) : null}
        </>
      )}
    </AuthenticatedLayout>
  );
}
