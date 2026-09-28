"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { AlertCircle, ArrowLeft, FileText } from "lucide-react";
import {
  ApiError,
  normalizeRequirement,
  type RequirementItem,
} from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "enhancement", label: "Enhancement" },
  { value: "security", label: "Security" },
  { value: "uiux", label: "UI/UX" },
  { value: "performance", label: "Performance" },
  { value: "database", label: "Database" },
  { value: "api", label: "API" },
  { value: "documentation", label: "Documentation" },
];

const BUSINESS_VALUE_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "inProgress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "testing", label: "Testing" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FieldError {
  field: string;
  message: string;
}

function errorMessageFor(
  details: FieldError[],
  field: string,
): string | undefined {
  return details.find((detail) => detail.field === field)?.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchRequirementById(
  id: string,
  signal: AbortSignal,
): Promise<RequirementItem> {
  let response: Response;
  try {
    response = await fetch(`/api/requirements/${id}`, {
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
        : `Could not load requirement (HTTP ${response.status}).`;
    if (response.status === 401) {
      throw new ApiError("UNAUTHENTICATED", message, 401);
    }
    if (response.status === 404) {
      throw new ApiError("NOT_FOUND", "Requirement not found.", 404);
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
  const requirement = normalizeRequirement(payload.data);
  if (requirement === null) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected response.",
      response.status,
    );
  }
  return requirement;
}

export default function RequirementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? "") : "";
  const idValid = UUID_RE.test(id);

  const [attempt, setAttempt] = React.useState(0);
  const requestKey = `${id}:${attempt}`;
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    requirement: RequirementItem | null;
    error: ApiError | null;
  } | null>(null);

  React.useEffect(() => {
    if (!idValid) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const requirement = await fetchRequirementById(id, controller.signal);
        if (cancelled) return;
        setSnapshot({ key: requestKey, requirement, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.status === 404)) {
          setSnapshot({ key: requestKey, requirement: null, error: null });
          return;
        }
        setSnapshot({
          key: requestKey,
          requirement: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError("INTERNAL_ERROR", "Something went wrong loading the requirement."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `requestKey` fully describes the request; `attempt` is folded into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, requestKey]);

  const retry = React.useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const current = snapshot !== null && snapshot.key === requestKey ? snapshot : null;
  const isLoading = idValid && current === null;
  const error = current?.error ?? null;
  const requirement = current?.requirement ?? null;

  if (!idValid) {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="Requirement Not Found"
          description="The requirement ID in the URL is not a valid identifier."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requirements", href: "/requirements" },
            { label: "Not found" },
          ]}
        />
        <EmptyState
          icon={FileText}
          title="Invalid requirement ID"
          description="Check the link and try again, or return to the requirements list."
          action={{
            label: "Back to Requirements",
            onClick: () => router.push("/requirements"),
          }}
        />
      </AuthenticatedLayout>
    );
  }

  if (isLoading && requirement === null) {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="Requirement"
          description="Loading requirement details…"
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requirements", href: "/requirements" },
            { label: "Detail" },
          ]}
        />
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error !== null && requirement === null) {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="Requirement"
          description="Could not load requirement details."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requirements", href: "/requirements" },
            { label: "Detail" },
          ]}
        />
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load requirements"
          description={error.message}
          action={{ label: "Try again", onClick: retry }}
          secondaryAction={{
            label: "Back to list",
            onClick: () => router.push("/requirements"),
          }}
        />
      </AuthenticatedLayout>
    );
  }

  if (requirement === null) {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="Requirement Not Found"
          description="No accessible requirement matches this ID."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Requirements", href: "/requirements" },
            { label: "Not found" },
          ]}
        />
        <EmptyState
          icon={FileText}
          title="Requirement not found"
          description="It may have been removed or belong to a project outside your access."
          action={{
            label: "Back to Requirements",
            onClick: () => router.push("/requirements"),
          }}
          secondaryAction={{ label: "Try again", onClick: retry }}
        />
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title={requirement.title}
        description={`Manage ${requirement.displayId}. Project and display ID cannot be changed.`}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Requirements", href: "/requirements" },
          { label: requirement.displayId },
        ]}
        secondaryActions={[
          {
            label: "Back to Requirements",
            onClick: () => router.push("/requirements"),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <RequirementEditForm
          key={requirement.id}
          requirement={requirement}
          onChanged={retry}
        />

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <StatusChip status={requirement.status} size="sm" />
              <PriorityChip priority={requirement.priority} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="sm">
                {requirement.category || "—"}
              </Badge>
              <Badge variant="outline" size="sm">
                {requirement.displayId}
              </Badge>
            </div>
            <dl className="space-y-2 text-slate-600">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Display ID (read-only)
                </dt>
                <dd className="font-mono text-xs text-slate-900">
                  {requirement.displayId}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Project ID (read-only)
                </dt>
                <dd className="break-all font-mono text-xs text-slate-900">
                  {requirement.projectId}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Updated
                </dt>
                <dd>{formatUpdated(requirement.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}

function RequirementEditForm({
  requirement,
  onChanged,
}: {
  requirement: RequirementItem;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(requirement.title);
  const [category, setCategory] = React.useState(requirement.category);
  const [description, setDescription] = React.useState(
    requirement.description ?? "",
  );
  const [businessValue, setBusinessValue] = React.useState(
    requirement.businessValue,
  );
  const [priority, setPriority] = React.useState(requirement.priority);
  const [status, setStatus] = React.useState(requirement.status);
  const [storyPoints, setStoryPoints] = React.useState(
    requirement.storyPoints === null ? "" : String(requirement.storyPoints),
  );
  const [assigneeId, setAssigneeId] = React.useState(
    requirement.assigneeId ?? "",
  );
  const [sprintId, setSprintId] = React.useState(requirement.sprintId ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<FieldError[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setFieldErrors([]);
    setFormError(null);
    setSavedMessage(null);

    // Send only editable PATCH fields that changed. projectId/displayId are
    // never sent (immutable). Role restrictions stay server-side; 403s surface.
    const body: Record<string, unknown> = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      setFieldErrors([{ field: "title", message: "Title is required." }]);
      return;
    }
    if (trimmedTitle !== requirement.title) body.title = trimmedTitle;
    if (category !== requirement.category) body.category = category;
    const trimmedDescription = description.trim();
    if (trimmedDescription !== (requirement.description ?? "")) {
      body.description = trimmedDescription === "" ? null : trimmedDescription;
    }
    if (businessValue !== requirement.businessValue) {
      body.businessValue = businessValue === "" ? null : businessValue;
    }
    if (priority !== requirement.priority) {
      body.priority = priority === "" ? null : priority;
    }
    if (status !== requirement.status) {
      body.status = status === "" ? null : status;
    }
    const trimmedStoryPoints = storyPoints.trim();
    const currentStoryPoints =
      requirement.storyPoints === null ? "" : String(requirement.storyPoints);
    if (trimmedStoryPoints !== currentStoryPoints) {
      if (trimmedStoryPoints === "") {
        body.storyPoints = null;
      } else {
        const parsed = Number(trimmedStoryPoints);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
          setFieldErrors([
            {
              field: "storyPoints",
              message: "Story points must be an integer between 0 and 1000.",
            },
          ]);
          return;
        }
        body.storyPoints = parsed;
      }
    }
    if (assigneeId.trim() !== (requirement.assigneeId ?? "")) {
      body.assigneeId = assigneeId.trim() === "" ? null : assigneeId.trim();
    }
    if (sprintId.trim() !== (requirement.sprintId ?? "")) {
      body.sprintId = sprintId.trim() === "" ? null : sprintId.trim();
    }
    if (Object.keys(body).length === 0) {
      setFormError("No changes to save. Edit at least one field.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/requirements/${requirement.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessPayload(payload)) {
        setFieldErrors(readErrorDetails(payload));
        setFormError(readErrorMessage(payload, response.status));
        return;
      }
      const updated = normalizeRequirement(payload.data);
      if (updated !== null) {
        setTitle(updated.title);
        setCategory(updated.category);
        setDescription(updated.description ?? "");
        setBusinessValue(updated.businessValue);
        setPriority(updated.priority);
        setStatus(updated.status);
        setStoryPoints(
          updated.storyPoints === null ? "" : String(updated.storyPoints),
        );
        setAssigneeId(updated.assigneeId ?? "");
        setSprintId(updated.sprintId ?? "");
      }
      setSavedMessage("Requirement updated.");
      onChanged();
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Edit requirement</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {formError !== null ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}
        {savedMessage !== null ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {savedMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Title"
            required
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={300}
            disabled={isSaving}
            error={errorMessageFor(fieldErrors, "title")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={CATEGORY_OPTIONS}
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "category")}
            />
            <Select
              label="Business value"
              name="businessValue"
              value={businessValue}
              onChange={(event) => setBusinessValue(event.target.value)}
              options={BUSINESS_VALUE_OPTIONS}
              placeholder="Not set"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "businessValue")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Priority"
              name="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              options={PRIORITY_OPTIONS}
              placeholder="Not set"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "priority")}
            />
            <Select
              label="Status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={STATUS_OPTIONS}
              placeholder="Not set"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "status")}
            />
          </div>
          <Textarea
            label="Description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            disabled={isSaving}
            error={errorMessageFor(fieldErrors, "description")}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Story points"
              name="storyPoints"
              value={storyPoints}
              onChange={(event) => setStoryPoints(event.target.value)}
              placeholder="Optional"
              inputMode="numeric"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "storyPoints")}
            />
            <Input
              label="Assignee ID"
              name="assigneeId"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              placeholder="Member UUID"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "assigneeId")}
            />
            <Input
              label="Sprint ID"
              name="sprintId"
              value={sprintId}
              onChange={(event) => setSprintId(event.target.value)}
              placeholder="Sprint UUID"
              disabled={isSaving}
              error={errorMessageFor(fieldErrors, "sprintId")}
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" isLoading={isSaving}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/requirements")}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function formatUpdated(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

function isSuccessPayload(
  payload: unknown,
): payload is { success: true; data: unknown } {
  return isRecord(payload) && payload.success === true && "data" in payload;
}

function readErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = payload.error.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403)
    return "You do not have permission to edit this requirement.";
  if (status === 404) return "Requirement not found.";
  return "Could not save changes. Check the highlighted fields.";
}

function readErrorDetails(payload: unknown): FieldError[] {
  if (!isRecord(payload) || !isRecord(payload.error)) return [];
  const details = payload.error.details;
  if (!Array.isArray(details)) return [];
  const mapped: FieldError[] = [];
  for (const entry of details) {
    if (!isRecord(entry)) continue;
    if (typeof entry.field !== "string" || typeof entry.message !== "string")
      continue;
    mapped.push({ field: entry.field, message: entry.message });
  }
  return mapped;
}
