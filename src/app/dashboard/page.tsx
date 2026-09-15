"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  FolderKanban,
  Users,
  Calendar,
  AlertCircle,
  ArrowRight,
  Clock,
  MoreHorizontal,
  Filter,
  Download,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-api";
import type { DashboardData } from "@/lib/dashboard-api";
import { formatDate, formatRelativeTime } from "@/lib/utils";

// Stat icons live in the UI layer — the API provides value/trend only.
type StatKey = keyof DashboardData["stats"];

const STAT_META: Array<{ key: StatKey; label: string; icon: LucideIcon }> = [
  { key: "activeProjects", label: "Active Projects", icon: FolderKanban },
  { key: "teamMembers", label: "Team Members", icon: Users },
  { key: "upcomingDeadlines", label: "Upcoming Deadlines", icon: Calendar },
  { key: "needsAttention", label: "Need Attention", icon: AlertCircle },
];

/**
 * Formats an API timestamp for display. Passes through values that are
 * already relative labels ("2 hours ago") and guards against invalid dates.
 */
function formatTimestampLabel(value: string): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

function formatEndDate(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

function DashboardLoadingState() {
  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Organization Dashboard"
        description="Overview of all projects and team activity"
        primaryAction={{
          label: "Create Project",
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => {},
          },
        ]}
      />

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
              <div className="mt-4">
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle>Recent Projects</CardTitle>
              <Skeleton className="h-8 w-24" />
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg border border-slate-200 space-y-3"
                  >
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Projects Table */}
      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Active Projects</CardTitle>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <SkeletonTable rows={5} />
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}

function DashboardErrorState({
  message,
  onRetry,
  onBrowseProjects,
}: {
  message: string;
  onRetry: () => void;
  onBrowseProjects: () => void;
}) {
  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Organization Dashboard"
        description="Overview of all projects and team activity"
        primaryAction={{
          label: "Create Project",
          onClick: onBrowseProjects,
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => {},
          },
        ]}
      />

      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load the dashboard"
            description={message}
            action={{ label: "Try again", onClick: onRetry }}
            secondaryAction={{ label: "Go to projects", onClick: onBrowseProjects }}
          />
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, error, isLoading, retry } = useDashboard();

  if (isLoading && data === null) {
    return <DashboardLoadingState />;
  }

  if (data === null) {
    return (
      <DashboardErrorState
        message={
          error?.message ??
          "Something went wrong loading the dashboard. Please try again."
        }
        onRetry={retry}
        onBrowseProjects={() => router.push("/projects")}
      />
    );
  }

  const stats = STAT_META.map((meta) => ({
    ...meta,
    value: String(data.stats[meta.key].value),
    trend: data.stats[meta.key].trend,
  }));

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Organization Dashboard"
        description="Overview of all projects and team activity"
        primaryAction={{
          label: "Create Project",
          onClick: () => router.push("/projects/create"),
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => {},
          },
        ]}
      />

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {stat.value}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-slate-600" />
                </div>
              </div>
              <div className="mt-4">
                {stat.trend ? (
                  <Badge variant="default" size="sm">
                    {stat.trend}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle>Recent Projects</CardTitle>
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {data.recentProjects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No recent projects"
                  description="Projects in your organization will show up here."
                  action={{ label: "Create Project", onClick: () => router.push("/projects/create") }}
                />
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {data.recentProjects.map((project) => (
                    <div
                      key={project.id}
                      className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <StatusChip status={project.status} size="sm" />
                        <span className="text-xs text-slate-400">
                          {formatTimestampLabel(project.updatedAt)}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">
                        {project.name}
                      </h4>
                      <p className="text-sm text-slate-500 mb-3">
                        {project.client}
                      </p>
                      <div className="flex items-center gap-2">
                        <Progress value={project.progress} size="sm" />
                        <span className="text-xs text-slate-500 w-10">
                          {project.progress}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity yet.</p>
              ) : (
                <div className="space-y-4">
                  {data.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">
                          {activity.action}
                        </p>
                        <p className="text-xs text-slate-500">
                          {activity.project}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {activity.user} • {formatTimestampLabel(activity.time)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Projects Table */}
      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Active Projects</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  className="pl-9 pr-4 h-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
              </div>
              <Button variant="secondary" size="sm" leftIcon={<Filter className="h-4 w-4" />}>
                Filter
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.activeProjects.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={FolderKanban}
                  title="No active projects"
                  description="Active projects in your organization will show up here."
                  action={{ label: "Create Project", onClick: () => router.push("/projects/create") }}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Current Sprint</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.activeProjects.map((project) => (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">
                        {project.name}
                      </TableCell>
                      <TableCell>{project.client}</TableCell>
                      <TableCell>{project.manager.name || "Unassigned"}</TableCell>
                      <TableCell>
                        <StatusChip status={project.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 w-32">
                          <Progress value={project.progress} size="sm" />
                          <span className="text-xs text-slate-500 w-8">
                            {project.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{project.currentSprint.name || "—"}</TableCell>
                      <TableCell>{formatEndDate(project.endDate)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
