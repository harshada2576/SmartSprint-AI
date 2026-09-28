"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PriorityChip, StatusChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { useUser } from "@/lib/auth/use-user";
import {
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  User,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
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
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface CommentItem {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorLastName: string;
  authorEmail: string;
  authorInitials: string;
}

export default function TaskDetailPage() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const taskId = typeof routeParams?.id === "string" ? routeParams.id : "";
  const idValid = taskId !== "" && UUID_RE.test(taskId);

  const { role, user: currentUser } = useUser();
  const isPM = role === "PROJECT_MANAGER" || role === "ADMIN";

  const [task, setTask] = React.useState<TaskItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Form states
  const [isEditing, setIsEditing] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("medium");
  const [status, setStatus] = React.useState("backlog");
  const [progressPercent, setProgressPercent] = React.useState(0);
  const [estimatedHours, setEstimatedHours] = React.useState("");
  const [actualHours, setActualHours] = React.useState("");
  const [isBlocked, setIsBlocked] = React.useState(false);
  const [blockedReason, setBlockedReason] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Blocker modal
  const [blockModalOpen, setBlockModalOpen] = React.useState(false);
  const [modalBlockReason, setModalBlockReason] = React.useState("");

  // Comments state
  const [comments, setComments] = React.useState<CommentItem[]>([]);
  const [loadingComments, setLoadingComments] = React.useState(false);
  const [newComment, setNewComment] = React.useState("");
  const [postingComment, setPostingComment] = React.useState(false);

  const fetchTask = React.useCallback(async () => {
    if (!idValid) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Failed to load task");
        return;
      }
      const item = normalizeTask(json.data);
      setTask(item);
      if (item) {
        setTitle(item.title);
        setDescription(item.description ?? "");
        setPriority(item.priority);
        setStatus(item.columnStatus);
        setProgressPercent(item.progressPercent ?? 0);
        setEstimatedHours(item.estimatedHours ? String(item.estimatedHours) : "");
        setActualHours(item.actualHours ? String(item.actualHours) : "");
        setIsBlocked(item.isBlocked);
        setBlockedReason(item.blockedReason ?? "");
        setDueDate(item.dueDate ?? "");
      }
    } catch {
      setError("Network error loading task");
    } finally {
      setLoading(false);
    }
  }, [taskId, idValid]);

  const fetchComments = React.useCallback(async () => {
    if (!idValid) return;
    try {
      setLoadingComments(true);
      const res = await fetch(`/api/tasks/${taskId}/comments`);
      const json = await res.json();
      if (res.ok && json.success) {
        setComments(json.data);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoadingComments(false);
    }
  }, [taskId, idValid]);

  React.useEffect(() => {
    fetchTask();
    fetchComments();
  }, [fetchTask, fetchComments]);

  const handleQuickStatus = async (newStatus: string) => {
    if (!task) return;
    try {
      setSaving(true);
      const patchData: Record<string, unknown> = {
        columnStatus: newStatus,
        status: newStatus,
      };
      if (newStatus === "done") {
        patchData.progressPercent = 100;
        patchData.isBlocked = false;
      } else if (newStatus === "inProgress" && task.progressPercent === 0) {
        patchData.progressPercent = 25;
      }

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchTask();
      } else {
        alert(data.error?.message ?? "Failed to update task");
      }
    } catch {
      alert("Network error while updating task");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkBlockedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !modalBlockReason.trim()) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBlocked: true,
          blockedReason: modalBlockReason.trim(),
          columnStatus: "blocked",
          status: "blocked",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBlockModalOpen(false);
        setModalBlockReason("");
        await fetchTask();
      } else {
        alert(data.error?.message ?? "Failed to mark task blocked");
      }
    } catch {
      alert("Network error while marking task blocked");
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async () => {
    if (!task) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBlocked: false,
          blockedReason: null,
          columnStatus: "inProgress",
          status: "inProgress",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchTask();
      }
    } catch {
      alert("Network error unblocking task");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    try {
      setSaving(true);
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
        priority,
        columnStatus: status,
        status,
        progressPercent: Number(progressPercent),
        estimatedHours: estimatedHours.trim() === "" ? null : Number(estimatedHours),
        actualHours: actualHours.trim() === "" ? null : Number(actualHours),
        dueDate: dueDate.trim() === "" ? null : dueDate.trim(),
      };

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsEditing(false);
        await fetchTask();
      } else {
        alert(data.error?.message ?? "Failed to save task");
      }
    } catch {
      alert("Network error saving task");
    } finally {
      setSaving(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setPostingComment(true);
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewComment("");
        fetchComments();
      } else {
        alert(data.error?.message ?? "Failed to post comment");
      }
    } catch {
      alert("Network error posting comment");
    } finally {
      setPostingComment(false);
    }
  };

  if (!idValid) {
    return (
      <AuthenticatedLayout>
        <Card className="p-6">
          <EmptyState
            icon={AlertCircle}
            title="Invalid Task ID"
            description="The task ID in the URL must be a valid UUID."
            action={{ label: "Back to Execution", onClick: () => router.push("/execution") }}
          />
        </Card>
      </AuthenticatedLayout>
    );
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error || !task) {
    return (
      <AuthenticatedLayout>
        <Card className="p-6">
          <EmptyState
            icon={AlertCircle}
            title="Task Not Found"
            description={error ?? "Could not load the requested task."}
            action={{ label: "Back to Execution", onClick: () => router.push("/execution") }}
          />
        </Card>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-slate-500 hover:text-slate-900 -ml-2"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
      </div>

      <PageHeader
        title={task.title}
        description={`${task.displayId} • ${task.priority.toUpperCase()} priority • Status: ${task.columnStatus}`}
        primaryAction={
          !isEditing
            ? {
                label: "Edit Task",
                onClick: () => setIsEditing(true),
              }
            : undefined
        }
      />

      {/* Blocker Alert Banner */}
      {task.isBlocked && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Task is Blocked</p>
              <p className="text-xs text-red-700 mt-0.5">
                {task.blockedReason ? task.blockedReason : "No specific reason provided."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-700 hover:bg-red-100 self-start sm:self-auto text-xs"
            onClick={handleUnblock}
            disabled={saving}
          >
            Resolve Blocker
          </Button>
        </div>
      )}

      {/* Quick Developer Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
        <span className="text-xs font-semibold text-slate-500 mr-2">Quick Actions:</span>

        {task.columnStatus !== "inProgress" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => handleQuickStatus("inProgress")}
            disabled={saving}
          >
            Start Working
          </Button>
        )}

        {task.columnStatus !== "review" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => handleQuickStatus("review")}
            disabled={saving}
          >
            Ready for Review
          </Button>
        )}

        {task.columnStatus !== "done" && (
          <Button
            size="sm"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => handleQuickStatus("done")}
            disabled={saving}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Mark Done
          </Button>
        )}

        {!task.isBlocked && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-red-200 text-red-600 hover:bg-red-50 ml-auto"
            onClick={() => {
              setModalBlockReason("");
              setBlockModalOpen(true);
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Mark Blocked
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Info / Edit Card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Details & Specifications</CardTitle>
                <CardDescription>Comprehensive assignment parameters</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <PriorityChip priority={task.priority} />
                <StatusChip status={task.columnStatus} />
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleUpdate} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                    <Textarea
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add task context or acceptance criteria..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                      <Select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        options={STATUS_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                      <Select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        options={PRIORITY_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Progress ({progressPercent}%)
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={progressPercent}
                        onChange={(e) => setProgressPercent(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Est. Hours</label>
                      <Input
                        type="number"
                        step="0.5"
                        value={estimatedHours}
                        onChange={(e) => setEstimatedHours(e.target.value)}
                        placeholder="8"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Actual Hours</label>
                      <Input
                        type="number"
                        step="0.5"
                        value={actualHours}
                        onChange={(e) => setActualHours(e.target.value)}
                        placeholder="6.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Description
                    </span>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap mt-1">
                      {task.description ? task.description : "No description provided."}
                    </p>
                  </div>

                  {/* Progress Display */}
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700">Completion Progress</span>
                      <span className="font-bold text-slate-900">{task.progressPercent ?? 0}%</span>
                    </div>
                    <Progress value={task.progressPercent ?? 0} />
                    <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                      <span>Estimated: {task.estimatedHours ? `${task.estimatedHours} hrs` : "—"}</span>
                      <span>Actual: {task.actualHours ? `${task.actualHours} hrs` : "—"}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comments Section */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-slate-600" />
                  Discussion & Updates ({comments.length})
                </CardTitle>
                <CardDescription>Collaborative developer notes and status updates</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Comment Input */}
              <form onSubmit={handlePostComment} className="space-y-2">
                <Textarea
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share progress update, paste logs, or note dependencies..."
                  required
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={postingComment || !newComment.trim()}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {postingComment ? "Posting..." : "Post Comment"}
                  </Button>
                </div>
              </form>

              {/* Comment Thread */}
              <div className="divide-y divide-slate-100 pt-2">
                {loadingComments ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Loading discussion...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No comments yet. Start the conversation!
                  </p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="py-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-semibold text-xs flex-shrink-0 mt-0.5">
                        {c.authorInitials || "U"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-xs text-slate-900">
                            {c.authorName} {c.authorLastName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar Metadata */}
        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Story Points</span>
                <span className="font-semibold text-slate-800">{task.points ?? "—"} pts</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Due Date</span>
                <span className="font-semibold text-slate-800">
                  {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Sprint</span>
                <span className="font-semibold text-slate-800">
                  {task.sprintId ? "Assigned" : "Backlog"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Created</span>
                <span className="text-slate-600">
                  {task.createdAt ? formatDate(task.createdAt) : "—"}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Last Updated</span>
                <span className="text-slate-600">
                  {task.updatedAt ? formatRelativeTime(task.updatedAt) : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mark Blocked Modal */}
      <Modal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        title="Mark Task Blocked"
        description="Explain what external dependency, credential, or review is impeding progress."
      >
        <form onSubmit={handleMarkBlockedSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Blocker Reason / Impediment
            </label>
            <Textarea
              rows={3}
              required
              value={modalBlockReason}
              onChange={(e) => setModalBlockReason(e.target.value)}
              placeholder="e.g. Waiting for Stripe API webhook credentials from client..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setBlockModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={saving || !modalBlockReason.trim()}>
              {saving ? "Flagging..." : "Confirm Blocked"}
            </Button>
          </div>
        </form>
      </Modal>
    </AuthenticatedLayout>
  );
}
