"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { normalizeProject } from "@/lib/api-client";

// Field sets mirror `src/schemas/project-mutations.ts` (kept local so this
// client component never imports server validation code). Only fields the
// backend POST /api/projects accepts are rendered or sent: name, code,
// description, client, managerId, method, status, priority, progress,
// startDate, endDate, budgetTotal, budgetCurrency. There is deliberately no
// industry, business objectives/scope, milestones, cost categories, team
// membership, organization transfer, or role/user impersonation.
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

interface FieldError {
  field: string;
  message: string;
}

function errorMessageFor(details: FieldError[], field: string): string | undefined {
  return details.find((detail) => detail.field === field)?.message;
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export default function CreateProjectPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("general");

  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [client, setClient] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [method, setMethod] = React.useState<string>("scrum");
  const [status, setStatus] = React.useState<string>("pending");
  const [priority, setPriority] = React.useState<string>("medium");
  const [progress, setProgress] = React.useState("0");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [budgetTotal, setBudgetTotal] = React.useState("");
  const [budgetCurrency, setBudgetCurrency] = React.useState("");
  const [managerId, setManagerId] = React.useState("");

  const [fieldErrors, setFieldErrors] = React.useState<FieldError[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function clearFieldError(field: string): void {
    setFieldErrors((current) =>
      current.some((entry) => entry.field === field)
        ? current.filter((entry) => entry.field !== field)
        : current,
    );
  }

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) return;
    setFormError(null);

    // Client-side validation mirroring the backend create contract.
    const clientErrors: FieldError[] = [];
    const trimmedName = name.trim();
    if (trimmedName === "") {
      clientErrors.push({ field: "name", message: "Project name is required." });
    } else if (trimmedName.length > 200) {
      clientErrors.push({
        field: "name",
        message: "Project name must be at most 200 characters.",
      });
    }

    const trimmedCode = code.trim();
    if (trimmedCode !== "") {
      const upper = trimmedCode.toUpperCase();
      if (upper.length < 2 || upper.length > 20) {
        clientErrors.push({
          field: "code",
          message: "Project code must be 2-20 characters.",
        });
      } else if (!CODE_RE.test(upper)) {
        clientErrors.push({
          field: "code",
          message:
            'Project code must start alphanumeric and contain only letters, digits, "-" and "_".',
        });
      }
    }

    if (description.trim().length > 5000) {
      clientErrors.push({
        field: "description",
        message: "Description must be at most 5000 characters.",
      });
    }
    if (client.trim().length > 200) {
      clientErrors.push({
        field: "client",
        message: "Client must be at most 200 characters.",
      });
    }

    if (!(METHODS as readonly string[]).includes(method)) {
      clientErrors.push({ field: "method", message: "Method is invalid." });
    }
    if (!(STATUSES as readonly string[]).includes(status)) {
      clientErrors.push({ field: "status", message: "Status is invalid." });
    }
    if (!(PRIORITIES as readonly string[]).includes(priority)) {
      clientErrors.push({ field: "priority", message: "Priority is invalid." });
    }

    if (!/^\d+$/.test(progress.trim())) {
      clientErrors.push({
        field: "progress",
        message: "Progress must be a whole number between 0 and 100.",
      });
    } else {
      const parsed = Number(progress.trim());
      if (parsed < 0 || parsed > 100) {
        clientErrors.push({
          field: "progress",
          message: "Progress must be between 0 and 100.",
        });
      }
    }

    const trimmedStart = startDate.trim();
    const trimmedEnd = endDate.trim();
    if (trimmedStart !== "" && !isValidDate(trimmedStart)) {
      clientErrors.push({
        field: "startDate",
        message: "Start date must be a valid YYYY-MM-DD date.",
      });
    }
    if (trimmedEnd !== "" && !isValidDate(trimmedEnd)) {
      clientErrors.push({
        field: "endDate",
        message: "End date must be a valid YYYY-MM-DD date.",
      });
    }
    if (
      trimmedStart !== "" &&
      trimmedEnd !== "" &&
      isValidDate(trimmedStart) &&
      isValidDate(trimmedEnd) &&
      trimmedEnd < trimmedStart
    ) {
      clientErrors.push({
        field: "endDate",
        message: "End date must be on or after the start date.",
      });
    }

    const trimmedBudget = budgetTotal.trim();
    if (trimmedBudget !== "") {
      const amount = Number(trimmedBudget);
      if (!Number.isFinite(amount)) {
        clientErrors.push({ field: "budgetTotal", message: "Budget must be a number." });
      } else if (amount < 0 || amount > 9999999999.99) {
        clientErrors.push({
          field: "budgetTotal",
          message: "Budget must be between 0 and 9999999999.99.",
        });
      }
    }

    const trimmedCurrency = budgetCurrency.trim();
    if (trimmedCurrency !== "" && !CURRENCY_RE.test(trimmedCurrency.toUpperCase())) {
      clientErrors.push({
        field: "budgetCurrency",
        message: "Currency must be a 3-letter code (e.g. USD).",
      });
    }

    const trimmedManager = managerId.trim();
    if (trimmedManager !== "" && !UUID_RE.test(trimmedManager)) {
      clientErrors.push({
        field: "managerId",
        message: "Manager must be a valid user UUID, or blank to leave unassigned.",
      });
    }

    if (clientErrors.length > 0) {
      setFieldErrors(clientErrors);
      setFormError("Please fix the highlighted fields before creating.");
      const firstField = clientErrors[0]?.field;
      if (firstField === "startDate" || firstField === "endDate") setActiveTab("timeline");
      else if (firstField === "budgetTotal" || firstField === "budgetCurrency")
        setActiveTab("budget");
      else if (firstField === "managerId") setActiveTab("team");
      else if (
        firstField === "name" ||
        firstField === "code" ||
        firstField === "client" ||
        firstField === "description" ||
        firstField === "method" ||
        firstField === "status" ||
        firstField === "priority" ||
        firstField === "progress"
      )
        setActiveTab("general");
      return;
    }
    setFieldErrors([]);

    // Only send fields the backend accepts (POST /api/projects). No
    // industry, objectives, scope, milestones, team members,
    // organizationId, userId, or role — ownership derives server-side.
    const body: Record<string, unknown> = {
      name: trimmedName,
      method,
      status,
      priority,
      progress: Number(progress.trim()),
    };
    if (trimmedCode !== "") body.code = trimmedCode.toUpperCase();
    if (description.trim() !== "") body.description = description.trim();
    if (client.trim() !== "") body.client = client.trim();
    if (trimmedStart !== "") body.startDate = trimmedStart;
    if (trimmedEnd !== "") body.endDate = trimmedEnd;
    if (trimmedBudget !== "") body.budgetTotal = Number(trimmedBudget);
    if (trimmedCurrency !== "") body.budgetCurrency = trimmedCurrency.toUpperCase();
    if (trimmedManager !== "") body.managerId = trimmedManager;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
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
        setFieldErrors(readErrorDetails(payload));
        setFormError(readErrorMessage(payload, response.status));
        return;
      }
      const created = normalizeProject(payload.data);
      if (created !== null) {
        router.push(`/projects/${created.id}`);
      } else {
        router.push("/projects");
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const reviewRows: Array<{ label: string; value: string }> = [
    { label: "Project Name", value: name.trim() === "" ? "—" : name.trim() },
    { label: "Project Code", value: code.trim() === "" ? "Auto-generated" : code.trim().toUpperCase() },
    { label: "Client", value: client.trim() === "" ? "—" : client.trim() },
    { label: "Methodology", value: method },
    { label: "Status", value: status },
    { label: "Priority", value: priority },
    { label: "Progress", value: `${progress.trim() === "" ? "0" : progress.trim()}%` },
    {
      label: "Timeline",
      value:
        startDate.trim() === "" && endDate.trim() === ""
          ? "—"
          : `${startDate.trim() === "" ? "—" : startDate.trim()} → ${endDate.trim() === "" ? "—" : endDate.trim()}`,
    },
    {
      label: "Budget",
      value:
        budgetTotal.trim() === ""
          ? "—"
          : `${budgetTotal.trim()} ${budgetCurrency.trim() === "" ? "" : budgetCurrency.trim().toUpperCase()}`.trim(),
    },
    { label: "Manager", value: managerId.trim() === "" ? "Unassigned" : managerId.trim() },
  ];

  return (
    <AuthenticatedLayout>
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/projects")}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </button>

      <PageHeader
        title="Create Project"
        description="Set up a new project with all required details"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: "Create" },
        ]}
        primaryAction={{
          label: isSubmitting ? "Creating…" : "Create Project",
          onClick: () => void handleSubmit(),
        }}
        secondaryActions={[
          {
            label: "Cancel",
            onClick: () => router.push("/projects"),
          },
        ]}
      />

      {formError !== null ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 mb-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>
                Basic project details and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Project Name"
                  placeholder="E-Commerce Platform Redesign"
                  required
                  value={name}
                  maxLength={200}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "name")}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearFieldError("name");
                  }}
                />
                <Input
                  label="Project Code"
                  placeholder="ECOM-2025"
                  value={code}
                  maxLength={20}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "code")}
                  description="Optional. Auto-generated when left blank."
                  onChange={(event) => {
                    setCode(event.target.value);
                    clearFieldError("code");
                  }}
                />
              </div>
              <Input
                label="Client"
                placeholder="RetailCorp Inc."
                value={client}
                maxLength={200}
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "client")}
                onChange={(event) => {
                  setClient(event.target.value);
                  clearFieldError("client");
                }}
              />
              <Textarea
                label="Project Description"
                placeholder="Describe the project objectives and scope..."
                rows={4}
                value={description}
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "description")}
                onChange={(event) => {
                  setDescription(event.target.value);
                  clearFieldError("description");
                }}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Methodology"
                  options={METHODS.map((value) => ({ value, label: value }))}
                  value={method}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "method")}
                  onChange={(event) => {
                    setMethod(event.target.value);
                    clearFieldError("method");
                  }}
                />
                <Select
                  label="Priority"
                  options={PRIORITIES.map((value) => ({ value, label: value }))}
                  value={priority}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "priority")}
                  onChange={(event) => {
                    setPriority(event.target.value);
                    clearFieldError("priority");
                  }}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Status"
                  options={STATUSES.map((value) => ({ value, label: value }))}
                  value={status}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "status")}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    clearFieldError("status");
                  }}
                />
                <Input
                  label="Progress (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={progress}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "progress")}
                  onChange={(event) => {
                    setProgress(event.target.value);
                    clearFieldError("progress");
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Set project schedule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  value={startDate}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "startDate")}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    clearFieldError("startDate");
                    clearFieldError("endDate");
                  }}
                />
                <Input
                  label="Planned End Date"
                  type="date"
                  value={endDate}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "endDate")}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    clearFieldError("endDate");
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <CardDescription>
                Define project budget total and currency
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Budget Total"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="200000"
                  value={budgetTotal}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "budgetTotal")}
                  onChange={(event) => {
                    setBudgetTotal(event.target.value);
                    clearFieldError("budgetTotal");
                  }}
                />
                <Input
                  label="Budget Currency"
                  placeholder="USD"
                  maxLength={3}
                  value={budgetCurrency}
                  disabled={isSubmitting}
                  error={errorMessageFor(fieldErrors, "budgetCurrency")}
                  onChange={(event) => {
                    setBudgetCurrency(event.target.value);
                    clearFieldError("budgetCurrency");
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>
                Assign the project manager. The manager must already belong to the organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Project Manager"
                placeholder="Manager user UUID (blank to leave unassigned)"
                value={managerId}
                disabled={isSubmitting}
                error={errorMessageFor(fieldErrors, "managerId")}
                onChange={(event) => {
                  setManagerId(event.target.value);
                  clearFieldError("managerId");
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>
                Review all project information before creation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                {reviewRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <span className="text-sm text-slate-500">{row.label}</span>
                    <span className="text-sm font-medium text-slate-900 text-right break-all">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              {name.trim() === "" ? (
                <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span className="text-sm text-amber-800">
                    A project name is required before creation.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm text-emerald-800">
                    Required information has been provided
                  </span>
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => router.push("/projects")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleSubmit()} isLoading={isSubmitting}>
                  Create Project
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
    return "You do not have permission to create projects.";
  return "Could not create the project. Check the highlighted fields.";
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
