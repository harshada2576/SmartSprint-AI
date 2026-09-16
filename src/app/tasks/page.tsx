"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
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
import { AlertCircle, ClipboardList, Plus } from "lucide-react";
import {
  ApiError,
  buildQuery,
  normalizeTask,
  patchJson,
  postJson,
  useCollection,
  type TaskItem,
} from "@/lib/api-client";
import { formatDate, formatRelativeTime } from "@/lib/utils";

const TASKS_PAGE_SIZE = 20;

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

const STATUS_VALUES = STATUS_OPTIONS.map((option) => option.value);

interface TaskFormState {
  projectId: string;
  title: string;
  description: string;
  priority: string;
  points: string;
  assigneeId: string;
  sprintId: string;
  requirementId: string;
  status: string;
  dueDate: string;
}

const EMPTY_FORM: TaskFormState = {
  projectId: "",
  title: "",
  description: "",
  priority: "medium",
  points: "",
  assigneeId: "",
  sprintId: "",
  requirementId: "",
  status: "backlog",
  dueDate: "",
};

function formFromTask(task: TaskItem): TaskFormState {
  return {
    projectId: task.projectId,
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    points: task.points !== null ? String(task.points) : "",
    assigneeId: task.assigneeId ?? "",
    sprintId: task.sprintId ?? "",
    requirementId: task.requirementId ?? "",
    status: task.columnStatus,
    dueDate: task.dueDate ?? "",
  };
}

function formatUpdated(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

export default function TasksPage() {
  return (
    <React.Suspense fallback={null}>
      <TasksContent />
    </React.Suspense>
  );
}

function TasksContent() {
  const searchParams = useSearchParams();
  const query = React.useMemo(
    () => buildQuery({ page: 1, pageSize: TASKS_PAGE_SIZE }),
    [],
  );
  const {
    items: tasks,
    pagination,
    error: tasksError,
    isLoading: tasksLoading,
    retry: retryTasks,
  } = useCollection<TaskItem>("/api/tasks", normalizeTask, query);

  // The sprint board "+" buttons link here with ?create=1&sprintId=…&status=…
  // so column context carries over into the creation form (one-shot,
  // read during the initial render — no effect needed).
  const [showCreate, setShowCreate] = React.useState(
    () => searchParams.get("create") === "1",
  );
  const [createForm, setCreateForm] = React.useState<TaskFormState>(() => {
    const requestedStatus = searchParams.get("status");
    return {
      ...EMPTY_FORM,
      sprintId: searchParams.get("sprintId") ?? "",
      status: STATUS_VALUES.includes(requestedStatus ?? "")
        ? (requestedStatus as string)
        : "backlog",
    };
  });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<TaskFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const selectedTask =
    tasks.find((task) => task.id === selectedId) ?? null;

  const openDetail = (task: TaskItem) => {
    setSelectedId(task.id);
    setEditForm(formFromTask(task));
    setIsEditing(false);
    setFormError(null);
  };

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    const body: Record<string, unknown> = {
      projectId: createForm.projectId.trim(),
      title: createForm.title.trim(),
      status: createForm.status,
      priority: createForm.priority,
    };
    if (createForm.description.trim() !== "")
      body.description = createForm.description.trim();
    if (createForm.points.trim() !== "")
      body.points = Number(createForm.points);
    if (createForm.assigneeId.trim() !== "")
      body.assigneeId = createForm.assigneeId.trim();
    if (createForm.sprintId.trim() !== "")
      body.sprintId = createForm.sprintId.trim();
    if (createForm.requirementId.trim() !== "")
      body.requirementId = createForm.requirementId.trim();
    if (createForm.dueDate.trim() !== "")
      body.dueDate = createForm.dueDate.trim();
    try {
      await postJson("/api/tasks", body, normalizeTask, {
        fallback: "Could not create task",
      });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      retryTasks();
    } catch (error: unknown) {
      setFormError(
        error instanceof ApiError ? error.message : "Could not create task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTask) return;
    setSaving(true);
    setFormError(null);
    // NOTE: projectId is immutable on PATCH (backend rejects it), so the
    // edit form only sends the editable fields.
    const body: Record<string, unknown> = {
      title: editForm.title.trim(),
      description:
        editForm.description.trim() === ""
          ? null
          : editForm.description.trim(),
      priority: editForm.priority,
      points:
        editForm.points.trim() === "" ? null : Number(editForm.points),
      assigneeId:
        editForm.assigneeId.trim() === ""
          ? null
          : editForm.assigneeId.trim(),
      sprintId:
        editForm.sprintId.trim() === "" ? null : editForm.sprintId.trim(),
      requirementId:
        editForm.requirementId.trim() === ""
          ? null
          : editForm.requirementId.trim(),
      status: editForm.status,
      dueDate:
        editForm.dueDate.trim() === "" ? null : editForm.dueDate.trim(),
    };
    try {
      await patchJson(`/api/tasks/${selectedTask.id}`, body, normalizeTask, {
        fallback: "Could not update task",
      });
      setIsEditing(false);
      retryTasks();
    } catch (error: unknown) {
      // Authorization failures (e.g. a developer editing someone else's
      // task) surface here verbatim — never hidden or bypassed.
      setFormError(
        error instanceof ApiError ? error.message : "Could not update task.",
      );
    } finally {
      setSaving(false);
    }
  }

  const showLoading = tasksLoading && tasks.length === 0;

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Tasks"
        description="Create and manage tasks in your projects"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tasks" },
        ]}
      >
        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCreate((open) => !open);
              setFormError(null);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New task
          </Button>
        </div>
      </PageHeader>

      {showCreate ? (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h3 className="font-medium text-slate-900 mb-4">Create task</h3>
            {formError !== null ? (
              <p className="text-sm text-rose-600 mb-4">{formError}</p>
            ) : null}
            <form onSubmit={handleCreate}>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <Input
                  label="Title"
                  required
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, title: event.target.value })
                  }
                />
                <Input
                  label="Project ID"
                  required
                  placeholder="Project UUID"
                  value={createForm.projectId}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      projectId: event.target.value,
                    })
                  }
                />
              </div>
              <div className="mb-4">
                <Textarea
                  label="Description"
                  rows={3}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      description: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <Select
                  label="Priority"
                  options={PRIORITY_OPTIONS}
                  value={createForm.priority}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      priority: event.target.value,
                    })
                  }
                />
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={createForm.status}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, status: event.target.value })
                  }
                />
                <Input
                  label="Points"
                  type="number"
                  min={0}
                  value={createForm.points}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, points: event.target.value })
                  }
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <Input
                  label="Assignee ID"
                  placeholder="User UUID (optional)"
                  value={createForm.assigneeId}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      assigneeId: event.target.value,
                    })
                  }
                />
                <Input
                  label="Sprint ID"
                  placeholder="Sprint UUID (optional)"
                  value={createForm.sprintId}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      sprintId: event.target.value,
                    })
                  }
                />
                <Input
                  label="Requirement ID"
                  placeholder="Requirement UUID (optional)"
                  value={createForm.requirementId}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      requirementId: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <Input
                  label="Due date"
                  type="date"
                  value={createForm.dueDate}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      dueDate: event.target.value,
                    })
                  }
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating…" : "Create task"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreate(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : tasksError !== null && tasks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load tasks"
              description={tasksError.message}
              action={{ label: "Try again", onClick: retryTasks }}
            />
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="No tasks yet"
              description="Tasks in your projects will show up here."
              action={{
                label: "Create task",
                onClick: () => setShowCreate(true),
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/50">
                  <tr>
                    <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                      Task
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
                      Due
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => openDetail(task)}
                    >
                      <td className="p-4">
                        <p className="font-mono text-xs text-slate-400">
                          {task.displayId}
                        </p>
                        <p className="font-medium text-slate-900">
                          {task.title}
                        </p>
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
                        {formatDueDate(task.dueDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div>
            {selectedTask === null ? (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={ClipboardList}
                    title="Select a task"
                    description="Click a task to see its details and edit it."
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="font-mono text-xs text-slate-400 mb-1">
                    {selectedTask.displayId}
                  </p>
                  <h3 className="font-medium text-slate-900 mb-2">
                    {selectedTask.title}
                  </h3>
                  {selectedTask.description ? (
                    <p className="text-sm text-slate-600 mb-4">
                      {selectedTask.description}
                    </p>
                  ) : null}
                  <dl className="text-sm space-y-2 mb-4">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-slate-900">
                        {selectedTask.columnStatus}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Priority</dt>
                      <dd className="text-slate-900">
                        {selectedTask.priority}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Points</dt>
                      <dd className="text-slate-900">
                        {selectedTask.points ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Due</dt>
                      <dd className="text-slate-900">
                        {formatDueDate(selectedTask.dueDate)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Updated</dt>
                      <dd className="text-slate-900">
                        {formatUpdated(selectedTask.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                  {!isEditing ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditForm(formFromTask(selectedTask));
                        setIsEditing(true);
                        setFormError(null);
                      }}
                    >
                      Edit task
                    </Button>
                  ) : (
                    <form onSubmit={handleUpdate}>
                      {formError !== null ? (
                        <p className="text-sm text-rose-600 mb-4">
                          {formError}
                        </p>
                      ) : null}
                      <div className="space-y-4 mb-4">
                        <Input
                          label="Title"
                          required
                          value={editForm.title}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              title: event.target.value,
                            })
                          }
                        />
                        <Textarea
                          label="Description"
                          rows={3}
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              description: event.target.value,
                            })
                          }
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Select
                            label="Priority"
                            options={PRIORITY_OPTIONS}
                            value={editForm.priority}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                priority: event.target.value,
                              })
                            }
                          />
                          <Select
                            label="Status"
                            options={STATUS_OPTIONS}
                            value={editForm.status}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                status: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Points"
                            type="number"
                            min={0}
                            value={editForm.points}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                points: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Due date"
                            type="date"
                            value={editForm.dueDate}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </div>
                        <Input
                          label="Assignee ID"
                          placeholder="User UUID (empty to unassign)"
                          value={editForm.assigneeId}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              assigneeId: event.target.value,
                            })
                          }
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Sprint ID"
                            placeholder="Sprint UUID"
                            value={editForm.sprintId}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                sprintId: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Requirement ID"
                            placeholder="Requirement UUID"
                            value={editForm.requirementId}
                            onChange={(event) =>
                              setEditForm({
                                ...editForm,
                                requirementId: event.target.value,
                              })
                            }
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
          </div>
        </div>
      )}
      {!showLoading && tasksError === null && pagination.total > TASKS_PAGE_SIZE ? (
        <p className="text-sm text-slate-500 mt-4">
          Showing {tasks.length} of {pagination.total} tasks. Refine filters
          to see more.
        </p>
      ) : null}
    </AuthenticatedLayout>
  );
}
