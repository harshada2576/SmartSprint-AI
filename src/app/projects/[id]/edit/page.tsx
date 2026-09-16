"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  FolderKanban,
} from "lucide-react";
import {
  ApiError,
  normalizeProject,
  patchJson,
  type ProjectItem,
} from "@/lib/api-client";

/**
 * Edit project page (`/projects/[id]/edit`).
 *
 * Mutation contract: PATCH /api/projects/:id (see
 * `src/app/api/projects/[id]/route.ts`). Only the fields the backend accepts
 * are ever rendered or sent: name, code, description, client, managerId,
 * method, status, priority, progress, startDate, endDate, budgetTotal,
 * budgetCurrency. There is deliberately no organization transfer, no role/user
 * impersonation, and no unsupported fields (industry, business
 * objectives/scope, milestones, cost categories, team membership).
 *
 * Prefill source: GET /api/projects/:id returns the full project row,
 * normalized with the shared `normalizeProject` helper plus the extra
 * full-row columns (description, budget_total, budget_currency).
 */

// Field sets mirror `src/schemas/project-mutations.ts` (kept local so this
// client component never imports server validation code).
const METHODS = [
  "scrum",
  "kanban",
  "waterfall",
  "hybrid",
  "incremental",
  "prototyping",
  "spiral",
  "agile",
  "xp",
] as const;

const STATUSES = ["active", "inactive", "pending", "completed", "blocked"] as const;

const PRIORITIES = ["high", "medium", "low"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_]*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

interface EditableProject extends ProjectItem {
  description: string | null;
  budgetTotal: string | null;
  budgetCurrency: string | null;
}

function toNullableText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Extends the shared `normalizeProject` with the extra full-row columns the
 * list endpoint returns (description, budget_total, budget_currency) so the
 * form can be prefilled without inventing data.
 */
function normalizeEditableProject(value: unknown): EditableProject | null {
  const base = normalizeProject(value);
  if (base === null) return null;
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  return {
    ...base,
    description: toNullableText(row.description),
    budgetTotal: toNullableText(row.budget_total),
    budgetCurrency: toNullableText(row.budget_currency),
  };
}

/**
 * Loads one project by id through the dedicated detail endpoint. Returns
 * `null` when the id is not visible to the caller (missing or forbidden
 * share the same outcome — no existence oracle is exposed client-side
 * either).
 */
async function fetchProjectById(
  id: string,
  signal: AbortSignal,
): Promise<EditableProject | null> {
  let response: Response;
  try {
    response = await fetch(`/api/projects/${id}`, {
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
    if (response.status === 404) return null;
    const message =
      typeof payload === "object" && payload !== null && "error" in payload &&
      typeof (payload as { error: unknown }).error === "object" &&
      (payload as { error: { message?: unknown } }).error !== null &&
      typeof (payload as { error: { message?: unknown } }).error.message === "string"
        ? (payload as { error: { message: string } }).error.message
        : "Could not load project";
    if (response.status === 401) {
      throw new ApiError("UNAUTHENTICATED", message, 401);
    }
    throw new ApiError("INTERNAL_ERROR", `${message} (HTTP ${response.status}).`, response.status);
  }
  if (typeof payload !== "object" || payload === null) {
    throw new ApiError("INTERNAL_ERROR", "The server returned an unexpected response.");
  }
  const data = (payload as { data?: unknown }).data;
  const project = normalizeEditableProject(data);
  if (project === null) {
    throw new ApiError("INTERNAL_ERROR", "The server returned an unexpected response.");
  }
  return project;
}

function readRouteId(params: unknown): string {
  if (typeof params !== "object" || params === null) return "";
  const id = (params as Record<string, unknown>).id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

interface FormValues {
  name: string;
  code: string;
  description: string;
  client: string;
  managerId: string;
  method: string;
  status: string;
  priority: string;
  progress: string;
  startDate: string;
  endDate: string;
  budgetTotal: string;
  budgetCurrency: string;
}

function valuesFromProject(project: EditableProject): FormValues {
  return {
    name: project.name,
    code: project.code ?? "",
    description: project.description ?? "",
    client: project.client ?? "",
    managerId: project.managerId ?? "",
    method: project.method,
    status: project.status,
    priority: project.priority,
    progress: String(project.progress),
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    budgetTotal: project.budgetTotal ?? "",
    budgetCurrency: project.budgetCurrency ?? "",
  };
}

const EMPTY_VALUES: FormValues = {
  name: "",
  code: "",
  description: "",
  client: "",
  managerId: "",
  method: "scrum",
  status: "pending",
  priority: "medium",
  progress: "0",
  startDate: "",
  endDate: "",
  budgetTotal: "",
  budgetCurrency: "",
};

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Client-side validation mirroring the backend mutation contract. */
function validateValues(values: FormValues, initial: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = values.name.trim();
  if (name === "") errors.name = "Project name is required.";
  else if (name.length > 200) errors.name = "Project name must be at most 200 characters.";

  const code = values.code.trim();
  if (code !== "") {
    const upper = code.toUpperCase();
    if (upper.length < 2 || upper.length > 20)
      errors.code = "Project code must be 2-20 characters.";
    else if (!CODE_RE.test(upper))
      errors.code = 'Project code must start alphanumeric and contain only letters, digits, "-" and "_".';
  } else if (initial.code !== "") {
    errors.code = "Project code cannot be cleared once set.";
  }

  if (values.description.trim().length > 5000)
    errors.description = "Description must be at most 5000 characters.";

  if (values.client.trim().length > 200)
    errors.client = "Client must be at most 200 characters.";

  const managerId = values.managerId.trim();
  if (managerId !== "" && !UUID_RE.test(managerId))
    errors.managerId = "Manager must be a valid user UUID, or blank to unassign.";

  if (!(METHODS as readonly string[]).includes(values.method))
    errors.method = "Method is invalid.";
  if (!(STATUSES as readonly string[]).includes(values.status))
    errors.status = "Status is invalid.";
  if (!(PRIORITIES as readonly string[]).includes(values.priority))
    errors.priority = "Priority is invalid.";

  if (!/^\d+$/.test(values.progress.trim()))
    errors.progress = "Progress must be a whole number between 0 and 100.";
  else {
    const progress = Number(values.progress.trim());
    if (progress < 0 || progress > 100)
      errors.progress = "Progress must be between 0 and 100.";
  }

  if (values.startDate.trim() !== "" && !isValidDate(values.startDate.trim()))
    errors.startDate = "Start date must be a valid YYYY-MM-DD date.";
  if (values.endDate.trim() !== "" && !isValidDate(values.endDate.trim()))
    errors.endDate = "End date must be a valid YYYY-MM-DD date.";
  const effectiveStart =
    values.startDate.trim() !== "" ? values.startDate.trim() : initial.startDate.trim();
  const effectiveEnd =
    values.endDate.trim() !== "" ? values.endDate.trim() : initial.endDate.trim();
  if (
    errors.startDate === undefined &&
    errors.endDate === undefined &&
    effectiveStart !== "" &&
    effectiveEnd !== "" &&
    effectiveEnd < effectiveStart
  ) {
    errors.endDate = 'End date must be on or after the start date.';
  }

  const budget = values.budgetTotal.trim();
  if (budget !== "") {
    const amount = Number(budget);
    if (!Number.isFinite(amount))
      errors.budgetTotal = "Budget must be a number.";
    else if (amount < 0 || amount > 9999999999.99)
      errors.budgetTotal = "Budget must be between 0 and 9999999999.99.";
  }

  const currency = values.budgetCurrency.trim();
  if (currency !== "" && !CURRENCY_RE.test(currency.toUpperCase()))
    errors.budgetCurrency = "Currency must be a 3-letter code (e.g. USD).";

  return errors;
}

/**
 * Builds the PATCH body as a diff of editable fields only (the backend
 * requires at least one editable field and rejects unknown/identity fields).
 * Returns `null` when nothing changed.
 */
function buildPatchBody(
  values: FormValues,
  initial: FormValues,
): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};

  const name = values.name.trim();
  if (name !== initial.name) body.name = name;

  const code = values.code.trim();
  if (code.toUpperCase() !== initial.code.trim().toUpperCase()) body.code = code;

  const description = values.description.trim();
  if (description !== initial.description.trim())
    body.description = description === "" ? null : values.description.trim();

  const client = values.client.trim();
  if (client !== initial.client.trim())
    body.client = client === "" ? null : values.client.trim();

  const managerId = values.managerId.trim();
  if (managerId !== initial.managerId.trim())
    body.managerId = managerId === "" ? null : managerId;

  if (values.method !== initial.method) body.method = values.method;
  if (values.status !== initial.status) body.status = values.status;
  if (values.priority !== initial.priority) body.priority = values.priority;

  if (values.progress.trim() !== initial.progress.trim())
    body.progress = Number(values.progress.trim());

  const startDate = values.startDate.trim();
  if (startDate !== initial.startDate.trim())
    body.startDate = startDate === "" ? null : startDate;

  const endDate = values.endDate.trim();
  if (endDate !== initial.endDate.trim())
    body.endDate = endDate === "" ? null : endDate;

  const budget = values.budgetTotal.trim();
  const initialBudget = initial.budgetTotal.trim();
  const budgetChanged =
    (budget === "") !== (initialBudget === "") ||
    (budget !== "" && initialBudget !== "" && Number(budget) !== Number(initialBudget));
  if (budgetChanged) body.budgetTotal = budget === "" ? null : Number(budget);

  const currency = values.budgetCurrency.trim().toUpperCase();
  if (currency !== initial.budgetCurrency.trim().toUpperCase()) {
    // The backend ignores a blank currency (no clearing), so only send values.
    if (currency !== "") body.budgetCurrency = currency;
  }

  return Object.keys(body).length > 0 ? body : null;
}

type LoadState = "loading" | "load-error" | "not-found" | "ready";

export default function EditProjectPage() {
  const router = useRouter();
  const routeParams = useParams();
  const routeId = readRouteId(routeParams);

  const [attempt, setAttempt] = React.useState(0);
  // Loaded snapshot keyed by request (same derived-loading pattern as
  // `useCollection` in `@/lib/api-client`): loading is derived by comparing
  // the snapshot key with the requested key, so no setState-in-effect occurs.
  const requestKey = `${routeId}:${attempt}`;
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    project: EditableProject | null;
    error: ApiError | null;
  } | null>(null);
  const [initial, setInitial] = React.useState<FormValues>(EMPTY_VALUES);
  const [values, setValues] = React.useState<FormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const successTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInvalidId = routeId !== "" && !UUID_RE.test(routeId);

  React.useEffect(() => {
    if (routeId === "" || isInvalidId) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const found = await fetchProjectById(routeId, controller.signal);
        if (cancelled) return;
        setSnapshot({ key: requestKey, project: found, error: null });
        if (found !== null) {
          const next = valuesFromProject(found);
          setInitial(next);
          setValues(next);
          setFieldErrors({});
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSnapshot({
          key: requestKey,
          project: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError("INTERNAL_ERROR", "Something went wrong loading the project."),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `requestKey` fully describes the request; `attempt` is folded into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, requestKey]);

  React.useEffect(() => {
    return () => {
      if (successTimer.current !== null) clearTimeout(successTimer.current);
    };
  }, []);

  const current = snapshot !== null && snapshot.key === requestKey ? snapshot : null;
  const loadState: LoadState =
    current === null
      ? "loading"
      : current.error !== null
        ? "load-error"
        : current.project === null
          ? "not-found"
          : "ready";
  const project = current?.project ?? null;
  const loadError = current?.error ?? null;

  const setField = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (isSaving || loadState !== "ready" || project === null) return;
    const errors = validateValues(values, initial);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Please fix the highlighted fields before saving.");
      setFormSuccess(null);
      return;
    }
    const body = buildPatchBody(values, initial);
    if (body === null) {
      setFormError("No changes to save.");
      setFormSuccess(null);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const updated = await patchJson(`/api/projects/${routeId}`, body, normalizeProject, {
        fallback: "Could not save project",
      });
      setFormSuccess(
        `Project “${updated?.name ?? project.name}” saved. Returning to project details…`,
      );
      if (successTimer.current !== null) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => {
        router.push(`/projects/${routeId}`);
      }, 900);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFormSuccess(null);
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong saving the project.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const detailHref = routeId !== "" ? `/projects/${routeId}` : "/projects";
  const headerName = project?.name ?? "Edit Project";
  const headerDescription =
    project !== null
      ? `Update details for ${project.name}${project.code ? ` • ${project.code}` : ""}`
      : "Update project details";

  return (
    <AuthenticatedLayout>
      {/* Back Navigation */}
      <button
        onClick={() => router.push(detailHref)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </button>

      <PageHeader
        title={headerName}
        description={headerDescription}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: project?.name ?? "Project", href: routeId !== "" ? detailHref : undefined },
          { label: "Edit" },
        ]}
        primaryAction={{
          label: "Save Changes",
          onClick: handleSubmit,
        }}
        secondaryActions={[
          {
            label: "Cancel",
            onClick: () => router.push(detailHref),
          },
        ]}
      />

      {routeId === "" || isInvalidId ? (
        <EmptyState
          icon={AlertCircle}
          title="Invalid project id"
          description="The project id in the URL must be a valid UUID."
          action={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
        />
      ) : loadState === "loading" ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading project…</CardTitle>
            <CardDescription>Fetching the current project values.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            </div>
            <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ) : loadState === "load-error" ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load project"
          description={loadError?.message ?? "Something went wrong loading the project."}
          action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
          secondaryAction={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
        />
      ) : loadState === "not-found" ? (
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          description="This project does not exist or you do not have access to it."
          action={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
          secondaryAction={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
        />
      ) : (
        <div className="space-y-6">
          {formError !== null && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-lg border border-rose-200">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
              <span className="text-sm text-rose-800">{formError}</span>
            </div>
          )}
          {formSuccess !== null && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <span className="text-sm text-emerald-800">{formSuccess}</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Basic project details and identification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Project Name"
                  placeholder="E-Commerce Platform Redesign"
                  required
                  value={values.name}
                  error={fieldErrors.name}
                  onChange={(event) => setField("name", event.target.value)}
                />
                <Input
                  label="Project Code"
                  placeholder="ECOM-2025"
                  value={values.code}
                  error={fieldErrors.code}
                  onChange={(event) => setField("code", event.target.value)}
                />
              </div>
              <Input
                label="Client"
                placeholder="RetailCorp Inc."
                value={values.client}
                error={fieldErrors.client}
                onChange={(event) => setField("client", event.target.value)}
              />
              <Textarea
                label="Project Description"
                placeholder="Describe the project objectives and scope..."
                rows={4}
                value={values.description}
                error={fieldErrors.description}
                onChange={(event) => setField("description", event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>Methodology, status, priority and progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <Select
                  label="Methodology"
                  options={METHODS.map((method) => ({ value: method, label: method }))}
                  value={values.method}
                  error={fieldErrors.method}
                  onChange={(event) => setField("method", event.target.value)}
                />
                <Select
                  label="Status"
                  options={STATUSES.map((status) => ({ value: status, label: status }))}
                  value={values.status}
                  error={fieldErrors.status}
                  onChange={(event) => setField("status", event.target.value)}
                />
                <Select
                  label="Priority"
                  options={PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
                  value={values.priority}
                  error={fieldErrors.priority}
                  onChange={(event) => setField("priority", event.target.value)}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Progress (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={values.progress}
                  error={fieldErrors.progress}
                  onChange={(event) => setField("progress", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Project schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  value={values.startDate}
                  error={fieldErrors.startDate}
                  onChange={(event) => setField("startDate", event.target.value)}
                />
                <Input
                  label="Planned End Date"
                  type="date"
                  value={values.endDate}
                  error={fieldErrors.endDate}
                  onChange={(event) => setField("endDate", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <CardDescription>Project budget total and currency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Budget Total"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="200000"
                  value={values.budgetTotal}
                  error={fieldErrors.budgetTotal}
                  onChange={(event) => setField("budgetTotal", event.target.value)}
                />
                <Input
                  label="Budget Currency"
                  placeholder="USD"
                  maxLength={3}
                  value={values.budgetCurrency}
                  error={fieldErrors.budgetCurrency}
                  onChange={(event) => setField("budgetCurrency", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ownership</CardTitle>
              <CardDescription>
                The manager must already belong to the organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Project Manager"
                placeholder="Manager user UUID (blank to unassign)"
                value={values.managerId}
                error={fieldErrors.managerId}
                onChange={(event) => setField("managerId", event.target.value)}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => router.push(detailHref)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
