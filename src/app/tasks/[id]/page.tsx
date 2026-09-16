"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PriorityChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { AlertCircle, ClipboardList } from "lucide-react";
import {
  ApiError,
  normalizeTask,
  patchJson,
  type TaskItem,
} from "@/lib/api-client";
import { formatDate, formatRelativeTime } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "inProgress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "testing", label: "Testing" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchTaskById(id: string, signal: AbortSignal): Promise<TaskItem> {
  let response: Response;
  try {
    response = await fetch(`/api/tasks/${id}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : `Could not load task (HTTP ${response.status}).`;
    if (response.status === 401) {
      throw new ApiError("UNAUTHENTICATED", message, 401);
    }
    if (response.status === 404) {
      throw new ApiError("NOT_FOUND", "Task not found.", 404);
    }
    throw new ApiError("INTERNAL_ERROR", message, response.status);
  }
  if (!isRecord(payload) || payload.success !== true) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected response.",
      response.status,
    );
  }
  const task = normalizeTask(payload.data);
  if (task === null) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected response.",
      response.status,
    );
  }
  return task;
}

function readRouteId(params: unknown): string {
  if (typeof params !== "object" || params === null) return "";
  const id = (params as Record<string, unknown>).id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

export default function TaskDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const taskId = readRouteId(routeParams);
  const idValid = taskId !== "" && UUID_RE.test(taskId);

  const [attempt, setAttempt] = React.useState(0);
  const requestKey = `${taskId}:${attempt}`;
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    task: TaskItem | null;
    error: ApiError | null;
  } | null>(null);

  React.useEffect(() => {
    if (!idValid) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const fetched = await fetchTaskById(taskId, controller.signal);
        if (cancelled) return;
        setSnapshot({ key: requestKey, task: fetched, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.status === 404)) {
          setSnapshot({ key: requestKey, task: null, error: null });
          return;
        }
        setSnapshot({
          key: requestKey,
          task: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError("INTERNAL_ERROR", "Something went wrong loading the task."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `requestKey` fully describes the request; `attempt` is folded into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, requestKey]);

  const retry = React.useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const current = snapshot !== null && snapshot.key === requestKey ? snapshot : null;
  const isLoading = idValid && current === null;
  const error = current?.error ?? null;
  const task = current?.task ?? null;

  const [isEditing, setIsEditing] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("medium");
  const [status, setStatus] = React.useState("backlog");
  const [points, setPoints] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");
  const [requirementId, setRequirementId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [prefilledFor, setPrefilledFor] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Render-time prefill (React-endorsed "adjust state during render"
  // pattern): runs when the row resolves or re-resolves after a refetch,
  // keyed by task id + updatedAt so fresh server data wins. No effect needed.
  const prefillKey = task !== null ? `${task.id}:${task.updatedAt}` : null;
  if (task !== null && prefillKey !== null && prefilledFor !== prefillKey) {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setStatus(task.columnStatus);
    setPoints(task.points !== null ? String(task.points) : "");
    setAssigneeId(task.assigneeId ?? "");
    setSprintId(task.sprintId ?? "");
    setRequirementId(task.requirementId ?? "");
    setDueDate(task.dueDate ?? "");
    setPrefilledFor(prefillKey);
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!task) return;
    setSaving(true);
    setFormError(null);
    // projectId is immutable on PATCH — never sent from the edit form.
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() === "" ? null : description.trim(),
      priority,
      points: points.trim() === "" ? null : Number(points),
      assigneeId: assigneeId.trim() === "" ? null : assigneeId.trim(),
      sprintId: sprintId.trim() === "" ? null : sprintId.trim(),
      requirementId:
        requirementId.trim() === "" ? null : requirementId.trim(),
      status,
      dueDate: dueDate.trim() === "" ? null : dueDate.trim(),
    };
    try {
      const updated = await patchJson(`/api/tasks/${task.id}`, body, normalizeTask, {
        fallback: "Could not update task",
      });
      if (updated !== null) {
        setTitle(updated.title);
        setDescription(updated.description ?? "");
        setPriority(updated.priority);
        setStatus(updated.columnStatus);
        setPoints(updated.points !== null ? String(updated.points) : "");
        setAssigneeId(updated.assigneeId ?? "");
        setSprintId(updated.sprintId ?? "");
        setRequirementId(updated.requirementId ?? "");
        setDueDate(updated.dueDate ?? "");
        setPrefilledFor(`${updated.id}:${updated.updatedAt}`);
      }
      setIsEditing(false);
      retry();
    } catch (updateError: unknown) {
      setFormError(
        updateError instanceof ApiError
          ? updateError.message
          : "Could not update task.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title={task?.title ?? "Task detail"}
        description={task ? task.displayId : "Loading task…"}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tasks", href: "/tasks" },
          { label: task?.displayId ?? "Detail" },
        ]}
      >
        <div className="mt-4">
          <Button variant="secondary" onClick={() => router.push("/tasks")}>
            Back to tasks
          </Button>
        </div>
      </PageHeader>

      {!idValid ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Invalid task ID"
              description="The task ID in the URL must be a valid UUID."
              action={{ label: "Back to tasks", onClick: () => router.push("/tasks") }}
            />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ) : error !== null ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load task"
              description={error.message}
              action={{ label: "Try again", onClick: retry }}
            />
          </CardContent>
        </Card>
      ) : task === null ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="Task not found"
              description="This task does not exist or you do not have access to it."
              action={{ label: "Back to tasks", onClick: () => router.push("/tasks") }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
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
              <PriorityChip priority={task.priority} size="sm" />
              <span className="text-xs text-slate-500">
                {task.points ?? "—"}
                {task.points !== null ? " pts" : ""}
              </span>
            </div>
            {task.description ? (
              <p className="text-sm text-slate-600 mb-4">{task.description}</p>
            ) : null}
            <dl className="text-sm space-y-2 mb-6">
              <div className="flex justify-between">
                <dt className="text-slate-500">Due</dt>
                <dd className="text-slate-900">
                  {task.dueDate ? formatDate(task.dueDate) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Updated</dt>
                <dd className="text-slate-900">
                  {task.updatedAt
                    ? formatRelativeTime(task.updatedAt)
                    : "—"}
                </dd>
              </div>
            </dl>
            {!isEditing ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setIsEditing(true);
                  setFormError(null);
                }}
              >
                Edit task
              </Button>
            ) : (
              <form onSubmit={handleUpdate}>
                {formError !== null ? (
                  <p className="text-sm text-rose-600 mb-4">{formError}</p>
                ) : null}
                <div className="space-y-4 mb-4">
                  <Input
                    label="Title"
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <Textarea
                    label="Description"
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Select
                      label="Priority"
                      options={PRIORITY_OPTIONS}
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    />
                    <Select
                      label="Status"
                      options={STATUS_OPTIONS}
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Points"
                      type="number"
                      min={0}
                      value={points}
                      onChange={(event) => setPoints(event.target.value)}
                    />
                    <Input
                      label="Due date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </div>
                  <Input
                    label="Assignee ID"
                    placeholder="User UUID (empty to unassign)"
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Sprint ID"
                      placeholder="Sprint UUID"
                      value={sprintId}
                      onChange={(event) => setSprintId(event.target.value)}
                    />
                    <Input
                      label="Requirement ID"
                      placeholder="Requirement UUID"
                      value={requirementId}
                      onChange={(event) => setRequirementId(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsEditing(false);
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </AuthenticatedLayout>
  );
}
