"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  FileText,
  FolderKanban,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  ApiError,
  normalizeProject,
  shortId,
  type ProjectItem,
} from "@/lib/api-client";
import { formatDate, formatRelativeTime } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DetailProject extends ProjectItem {
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
 * detail endpoint returns (description, budget_total, budget_currency).
 * Nothing is invented — absent columns stay null.
 */
function normalizeDetailProject(value: unknown): DetailProject | null {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchProjectById(
  id: string,
  signal: AbortSignal,
): Promise<DetailProject> {
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
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : `Could not load project (HTTP ${response.status}).`;
    if (response.status === 401) {
      throw new ApiError("UNAUTHENTICATED", message, 401);
    }
    if (response.status === 404) {
      throw new ApiError("NOT_FOUND", "Project not found.", 404);
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
  const project = normalizeDetailProject(payload.data);
  if (project === null) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected response.",
      response.status,
    );
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

function formatDay(value: string | null): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

function formatTimestamp(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

type LoadState = "loading" | "load-error" | "not-found" | "ready";

export default function ProjectCommandCenterPage() {
  const router = useRouter();
  const routeParams = useParams();
  const routeId = readRouteId(routeParams);

  const [attempt, setAttempt] = React.useState(0);
  const requestKey = `${routeId}:${attempt}`;
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    project: DetailProject | null;
    error: ApiError | null;
  } | null>(null);

  const isInvalidId = routeId !== "" && !UUID_RE.test(routeId);

  React.useEffect(() => {
    if (routeId === "" || isInvalidId) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const project = await fetchProjectById(routeId, controller.signal);
        if (cancelled) return;
        setSnapshot({ key: requestKey, project, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.status === 404)) {
          setSnapshot({ key: requestKey, project: null, error: null });
          return;
        }
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
  const editHref = routeId !== "" ? `/projects/${routeId}/edit` : "/projects";

  if (routeId === "" || isInvalidId) {
    return (
      <AuthenticatedLayout>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <PageHeader
          title="Project Not Found"
          description="The project id in the URL is not a valid identifier."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Projects", href: "/projects" },
            { label: "Not found" },
          ]}
        />
        <EmptyState
          icon={AlertCircle}
          title="Invalid project id"
          description="The project id in the URL must be a valid UUID."
          action={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
        />
      </AuthenticatedLayout>
    );
  }

  if (loadState === "loading") {
    return (
      <AuthenticatedLayout>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <PageHeader
          title="Project"
          description="Loading project details…"
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Projects", href: "/projects" },
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

  if (loadState === "load-error") {
    return (
      <AuthenticatedLayout>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <PageHeader
          title="Project"
          description="Could not load project details."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Projects", href: "/projects" },
            { label: "Detail" },
          ]}
        />
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load project"
          description={loadError?.message ?? "Something went wrong loading the project."}
          action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
          secondaryAction={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
        />
      </AuthenticatedLayout>
    );
  }

  if (loadState === "not-found" || project === null) {
    return (
      <AuthenticatedLayout>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <PageHeader
          title="Project Not Found"
          description="No accessible project matches this ID."
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Projects", href: "/projects" },
            { label: "Not found" },
          ]}
        />
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          description="This project does not exist or you do not have access to it."
          action={{ label: "Back to Projects", onClick: () => router.push("/projects") }}
          secondaryAction={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
        />
      </AuthenticatedLayout>
    );
  }

  const headerMeta = [project.code, project.client].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );

  const stats = [
    { label: "Progress", value: `${project.progress}%`, icon: TrendingUp },
    {
      label: "Budget",
      value:
        project.budgetTotal !== null
          ? `${project.budgetTotal}${project.budgetCurrency ? ` ${project.budgetCurrency}` : ""}`
          : "—",
      icon: Wallet,
    },
    { label: "Start", value: formatDay(project.startDate), icon: Calendar },
    { label: "End", value: formatDay(project.endDate), icon: Calendar },
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
        title={project.name}
        description={headerMeta.length > 0 ? headerMeta.join(" • ") : "Project details"}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
        primaryAction={{
          label: "Edit Project",
          onClick: () => router.push(editHref),
        }}
        secondaryActions={[
          {
            label: "Back to Projects",
            onClick: () => router.push("/projects"),
          },
        ]}
      >
        <div className="flex items-center gap-3 mt-4">
          <StatusChip status={project.status} />
          {project.method ? (
            <Badge variant="secondary" size="sm">
              {project.method}
            </Badge>
          ) : null}
          <Badge
            variant={project.priority === "high" ? "danger" : "default"}
            size="sm"
          >
            {project.priority} Priority
          </Badge>
        </div>
      </PageHeader>

      {/* Stats Grid — real API data only */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {stat.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
              <CardDescription>Project description</CardDescription>
            </CardHeader>
            <CardContent>
              {project.description ? (
                <p className="text-sm text-slate-600">{project.description}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  No description has been added for this project yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Code</dt>
                  <dd className="text-slate-900">{project.code ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Client</dt>
                  <dd className="text-slate-900">{project.client ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Manager</dt>
                  <dd className="text-slate-900">{shortId(project.managerId)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Method</dt>
                  <dd className="text-slate-900">{project.method === "" ? "—" : project.method}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
                  <dd className="text-slate-900">{project.status}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Priority</dt>
                  <dd className="text-slate-900">{project.priority}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Start date</dt>
                  <dd className="text-slate-900">{formatDay(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">End date</dt>
                  <dd className="text-slate-900">{formatDay(project.endDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Updated</dt>
                  <dd className="text-slate-900">{formatTimestamp(project.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Created</dt>
                  <dd className="text-slate-900">{formatTimestamp(project.createdAt)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Requirements — no dedicated project-scoped endpoint is consumed
              here, so show an honest empty state instead of invented rows. */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Requirements</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/requirements")}
              >
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={FileText}
                title="No requirement summary available"
                description="Requirement totals for this project are not exposed by the project endpoint. Browse the full requirements list instead."
                action={{ label: "View Requirements", onClick: () => router.push("/requirements") }}
              />
            </CardContent>
          </Card>

          {/* Activity — no activity feed endpoint exists. */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={FolderKanban}
                title="No activity feed available"
                description="There is no activity endpoint backing this view yet."
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<FileText className="h-4 w-4" />}
                onClick={() => router.push("/requirements")}
              >
                View Requirements
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Sparkles className="h-4 w-4" />}
                onClick={() => router.push("/ai-recommendations")}
              >
                AI Recommendations
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Calendar className="h-4 w-4" />}
                onClick={() => router.push("/sprint-board")}
              >
                Open Sprint Board
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Users className="h-4 w-4" />}
                onClick={() => router.push(editHref)}
              >
                Edit Project
              </Button>
            </CardContent>
          </Card>

          {/* Team — the project endpoint exposes only a manager id. */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Manager: {shortId(project.managerId)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Full team membership is not exposed by the project endpoint.
              </p>
            </CardContent>
          </Card>

          {/* Deadlines — no milestone/deadline endpoint exists. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Calendar}
                title="No deadlines available"
                description="Milestones and deadlines are not exposed by the project endpoint."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
