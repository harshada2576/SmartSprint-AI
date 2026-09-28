"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  buildQuery,
  normalizeProject,
  normalizeRequirement,
  useCollection,
} from "@/lib/api-client";

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

export default function RequirementCreatePage() {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("feature");
  const [description, setDescription] = React.useState("");
  const [businessValue, setBusinessValue] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldError[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const projectsQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: 100 }),
    [],
  );
  const {
    items: projects,
    error: projectsError,
    isLoading: projectsLoading,
  } = useCollection("/api/projects", normalizeProject, projectsQuery);

  const projectOptions = React.useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.code ? `${project.name} (${project.code})` : project.name,
      })),
    [projects],
  );

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setFieldErrors([]);
    setFormError(null);

    const clientErrors: FieldError[] = [];
    const trimmedTitle = title.trim();
    if (projectId.trim() === "") {
      clientErrors.push({ field: "projectId", message: "Project is required." });
    } else if (!UUID_RE.test(projectId.trim())) {
      clientErrors.push({
        field: "projectId",
        message: "Project must be a valid selection.",
      });
    }
    if (trimmedTitle === "") {
      clientErrors.push({ field: "title", message: "Title is required." });
    } else if (trimmedTitle.length > 300) {
      clientErrors.push({
        field: "title",
        message: "Title must be at most 300 characters.",
      });
    }
    if (category.trim() === "") {
      clientErrors.push({ field: "category", message: "Category is required." });
    }
    if (clientErrors.length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    // Only send fields the backend accepts (POST /api/requirements).
    // No organizationId, no userId/role — ownership derives from projectId.
    const body: Record<string, unknown> = {
      projectId: projectId.trim(),
      title: trimmedTitle,
      category,
    };
    if (description.trim() !== "") body.description = description.trim();
    if (businessValue !== "") body.businessValue = businessValue;
    if (priority !== "") body.priority = priority;
    if (status !== "") body.status = status;
    if (assigneeId.trim() !== "") body.assigneeId = assigneeId.trim();
    if (sprintId.trim() !== "") body.sprintId = sprintId.trim();

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/requirements", {
        method: "POST",
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
        const message = readErrorMessage(payload, response.status);
        const details = readErrorDetails(payload);
        setFieldErrors(details);
        setFormError(message);
        return;
      }
      const created = normalizeRequirement(payload.data);
      if (created !== null) {
        router.push(`/requirements/${created.id}`);
      } else {
        router.push("/requirements");
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Add Requirement"
        description="Create a new software requirement in an existing project."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Requirements", href: "/requirements" },
          { label: "New" },
        ]}
        secondaryActions={[
          {
            label: "Back to Requirements",
            onClick: () => router.push("/requirements"),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <Card>
        <CardContent className="p-6">
          {formError !== null ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Project"
              required
              name="projectId"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              options={projectOptions}
              placeholder={
                projectsLoading
                  ? "Loading projects…"
                  : projectOptions.length === 0
                    ? "No accessible projects"
                    : "Select a project"
              }
              disabled={projectsLoading || isSubmitting}
              error={errorMessageFor(fieldErrors, "projectId")}
              description={
                projectsError !== null
                  ? `Could not load projects: ${projectsError.message}`
                  : "Ownership is derived from the selected project."
              }
            />

            <Input
              label="Title"
              required
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Implement user authentication"
              maxLength={300}
              disabled={isSubmitting}
              error={errorMessageFor(fieldErrors, "title")}
            />

            <Select
              label="Category"
              required
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={CATEGORY_OPTIONS}
              disabled={isSubmitting}
              error={errorMessageFor(fieldErrors, "category")}
            />

            <Textarea
              label="Description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the requirement…"
              rows={4}
              disabled={isSubmitting}
              error={errorMessageFor(fieldErrors, "description")}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Business value"
                name="businessValue"
                value={businessValue}
                onChange={(event) => setBusinessValue(event.target.value)}
                options={BUSINESS_VALUE_OPTIONS}
                placeholder="Not set"
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "businessValue")}
              />
              <Select
                label="Priority"
                name="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                options={PRIORITY_OPTIONS}
                placeholder="Not set"
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "priority")}
              />
              <Select
                label="Status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                options={STATUS_OPTIONS}
                placeholder="Not set"
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "status")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Assignee ID"
                name="assigneeId"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                placeholder="Member UUID (optional)"
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "assigneeId")}
                description="Must be a member of the owning organization."
              />
              <Input
                label="Sprint ID"
                name="sprintId"
                value={sprintId}
                onChange={(event) => setSprintId(event.target.value)}
                placeholder="Sprint UUID (optional)"
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "sprintId")}
                description="Must belong to the selected project."
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" isLoading={isSubmitting}>
                Create Requirement
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/requirements")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    return "You do not have permission to create requirements in this project.";
  if (status === 404) return "The selected project was not found.";
  return "Could not create the requirement. Check the highlighted fields.";
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
