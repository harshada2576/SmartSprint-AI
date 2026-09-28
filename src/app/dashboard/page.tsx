"use client";

import * as React from "react";
import Link from "next/link";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUser } from "@/lib/auth/use-user";
import {
  FolderKanban,
  Users,
  Calendar,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building,
  Activity,
  ShieldAlert,
  Zap,
  Bot,
  Layers,
  HeartPulse,
  Plus,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  const { role, user, organization, isLoading: userLoading } = useUser();
  const [stats, setStats] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchStats = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/stats", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.data);
      } else {
        setError(data.error?.message ?? "Failed to load dashboard statistics");
      }
    } catch {
      setError("Network error while loading dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (userLoading || loading) {
    return (
      <AuthenticatedLayout>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-32 w-full" />
          </Card>
        </div>
      </AuthenticatedLayout>
    );
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD
  // -------------------------------------------------------------
  if (role === "ADMIN") {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="System Administration Dashboard"
          description={`Organization: ${organization?.name ?? "Global System"}`}
          primaryAction={{
            label: "Create Project",
            onClick: () => window.location.href = "/projects/create",
          }}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Users</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalUsers ?? 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="h-6 w-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">{stats?.activeUsers ?? 0} active members</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Organizations</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalOrganizations ?? 1}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Building className="h-6 w-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">Active tenants</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Projects</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalProjects ?? 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <FolderKanban className="h-6 w-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">Under management</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Security State</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">Healthy</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">RLS enforced</p>
            </CardContent>
          </Card>
        </div>

        {/* Tables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent System Activity */}
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">System Activity</CardTitle>
                <CardDescription>Real-time audit log of organization operations</CardDescription>
              </div>
              <Activity className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent>
              {stats?.recentActivity?.length === 0 ? (
                <EmptyState title="No activity recorded" description="Events will appear here as users perform actions." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {stats?.recentActivity?.map((act: any) => (
                    <div key={act.id} className="py-3 flex items-start justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {act.userFirstName ? `${act.userFirstName} ${act.userLastName}` : "System"}
                        </span>{" "}
                        <span className="text-slate-600">{act.value ?? act.action}</span>
                      </div>
                      <span className="text-slate-400 whitespace-nowrap ml-2">
                        {act.createdAt ? formatRelativeTime(act.createdAt) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Governance / Audit */}
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Recent Approvals & Governance</CardTitle>
                <CardDescription>Decisions and audit trail</CardDescription>
              </div>
              <ShieldAlert className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent>
              {stats?.recentAudit?.length === 0 ? (
                <EmptyState title="No governance records" description="Approval requests will appear here." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {stats?.recentAudit?.map((audit: any) => (
                    <div key={audit.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium text-slate-900">{audit.title}</p>
                        <p className="text-slate-500 text-[11px] uppercase tracking-wider">{audit.type}</p>
                      </div>
                      <Badge
                        variant={audit.status === "approved" ? "success" : audit.status === "pending" ? "warning" : "secondary"}
                      >
                        {audit.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AuthenticatedLayout>
    );
  }

  // -------------------------------------------------------------
  // DEVELOPER DASHBOARD
  // -------------------------------------------------------------
  if (role === "DEVELOPER") {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title={`Welcome back, ${user?.firstName ?? "Developer"}`}
          description="Your personal execution cockpit and active assignments"
          primaryAction={{
            label: "Open My Tasks",
            onClick: () => window.location.href = "/execution",
          }}
        />

        {/* Developer Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">My Total Tasks</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.myTasksCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats?.inProgressTasksCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{stats?.completedTasksCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats?.overdueTasksCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Blocked</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats?.blockedTasksCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Tasks List */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">My Assigned Tasks</CardTitle>
                  <CardDescription>Prioritized work currently assigned to you</CardDescription>
                </div>
                <Link href="/execution">
                  <Button variant="outline" size="sm">
                    View All
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {stats?.myTasks?.length === 0 ? (
                  <EmptyState title="No tasks assigned" description="You have no pending tasks assigned at this moment." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {stats?.myTasks?.map((task: any) => (
                      <div key={task.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-slate-500">{task.displayId}</span>
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-sm font-semibold text-slate-900 hover:text-blue-600 truncate"
                            >
                              {task.title}
                            </Link>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{task.projectName}</span>
                            {task.points && <span>• {task.points} pts</span>}
                            {task.dueDate && <span>• Due {formatDate(task.dueDate)}</span>}
                          </div>
                          {task.isBlocked && task.blockedReason && (
                            <p className="mt-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded inline-block">
                              Blocker: {task.blockedReason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <PriorityChip priority={task.priority} />
                          <StatusChip status={task.columnStatus} />
                          <Link href={`/tasks/${task.id}`}>
                            <Button variant="ghost" size="sm">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Active Sprint & Notifications */}
          <div className="space-y-6">
            {/* Active Sprint Card */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Active Sprint
                </CardTitle>
                <CardDescription>
                  {stats?.activeSprint ? stats.activeSprint.name : "No active sprint"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.activeSprint ? (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-600 font-medium">
                      {stats.activeSprint.goal ?? "No sprint goal defined"}
                    </p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Sprint Progress</span>
                        <span>
                          {stats.activeSprint.totalPoints
                            ? Math.round(((stats.activeSprint.completedPoints ?? 0) / stats.activeSprint.totalPoints) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <Progress
                        value={
                          stats.activeSprint.totalPoints
                            ? Math.round(((stats.activeSprint.completedPoints ?? 0) / stats.activeSprint.totalPoints) * 100)
                            : 0
                        }
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>Points Completed</span>
                      <span className="font-semibold text-slate-800">
                        {stats.activeSprint.completedPoints ?? 0} / {stats.activeSprint.totalPoints ?? 0}
                      </span>
                    </div>
                    <Link href="/sprint-board" className="block pt-2">
                      <Button variant="outline" className="w-full text-xs">
                        Open Sprint Board
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <EmptyState title="No active sprint" description="No sprint is currently in progress." />
                )}
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  Recent Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.notifications?.length === 0 ? (
                  <EmptyState title="No notifications" description="You are all caught up!" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {stats?.notifications?.map((notif: any) => (
                      <div key={notif.id} className="py-2.5 text-xs">
                        <p className="font-semibold text-slate-900">{notif.title}</p>
                        {notif.description && <p className="text-slate-500 text-[11px] mt-0.5">{notif.description}</p>}
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  // -------------------------------------------------------------
  // PROJECT MANAGER DASHBOARD
  // -------------------------------------------------------------
  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Project Management Dashboard"
        description="Comprehensive overview of projects, sprint health, team workload, and risk analysis"
        primaryAction={{
          label: "New Project",
          onClick: () => (window.location.href = "/projects/create"),
        }}
        secondaryActions={[
          {
            label: "Sprint Planning",
            onClick: () => (window.location.href = "/sprint-planning"),
          },
          {
            label: "AI Assistant",
            onClick: () => (window.location.href = "/ai-assistant"),
          },
        ]}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Projects</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.activeProjects ?? 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <FolderKanban className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{stats?.totalProjects ?? 0} total projects in org</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed Tasks</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{stats?.completedTasks ?? 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{stats?.totalTasks ?? 0} total tasks planned</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Blocked Work</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{stats?.blockedTasks ?? 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{stats?.overdueTasks ?? 0} overdue tasks</p>
          </CardContent>
        </Card>

        {/* Project Health Score */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Project Health</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-slate-900">{stats?.projectHealth?.score ?? 100}</p>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
              <div
                className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                  (stats?.projectHealth?.score ?? 100) >= 80
                    ? "bg-emerald-50 text-emerald-600"
                    : (stats?.projectHealth?.score ?? 100) >= 60
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                <HeartPulse className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-3">
              <Badge
                variant={
                  stats?.projectHealth?.status === "healthy"
                    ? "success"
                    : stats?.projectHealth?.status === "attention"
                    ? "warning"
                    : "danger"
                }
              >
                {stats?.projectHealth?.status?.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Sprint Progress & Health Factors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Sprint Progress */}
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Current Sprint Status</CardTitle>
                <CardDescription>
                  {stats?.activeSprint ? `${stats.activeSprint.name} (${stats.activeSprint.projectName})` : "No Active Sprint"}
                </CardDescription>
              </div>
              <Link href="/sprint-planning">
                <Button variant="outline" size="sm">
                  Sprint Planning
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {stats?.activeSprint ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-700">Sprint Goal:</span>
                    <p className="text-sm text-slate-600 mt-0.5">{stats.activeSprint.goal ?? "No goal defined."}</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600">
                      <span>Points Completed</span>
                      <span>
                        {stats.activeSprint.totalPoints
                          ? Math.round(((stats.activeSprint.completedPoints ?? 0) / stats.activeSprint.totalPoints) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <Progress
                      value={
                        stats.activeSprint.totalPoints
                          ? Math.round(((stats.activeSprint.completedPoints ?? 0) / stats.activeSprint.totalPoints) * 100)
                          : 0
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-slate-400">Total Points</p>
                      <p className="font-bold text-slate-800 text-sm">{stats.activeSprint.totalPoints ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Completed</p>
                      <p className="font-bold text-emerald-600 text-sm">{stats.activeSprint.completedPoints ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Remaining</p>
                      <p className="font-bold text-slate-800 text-sm">
                        {Math.max(0, (stats.activeSprint.totalPoints ?? 0) - (stats.activeSprint.completedPoints ?? 0))}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No Active Sprint"
                  description="Start or plan a new sprint to begin tracking team velocity."
                  action={{
                    label: "Go to Sprint Planning",
                    onClick: () => (window.location.href = "/sprint-planning"),
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Health Analysis Breakdown */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-indigo-600" />
                Project Health Factors
              </CardTitle>
              <CardDescription>Transparent penalty indicators driving overall project score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats?.projectHealth?.factors?.map((factor: any) => (
                  <div key={factor.name} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          factor.value > 0 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-800">{factor.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-900">{factor.value} detected</span>
                      <span className="text-red-500 font-medium">-{factor.penalty} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: AI Insights & Quick Actions */}
        <div className="space-y-6">
          {/* AI Intelligence Card */}
          <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-indigo-950">
                <Bot className="h-5 w-5 text-indigo-600" />
                SmartSprint AI Layer
              </CardTitle>
              <CardDescription>Automated risk detection & breakdown engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-600">
                SmartSprint continuously monitors deadline proximity, workload limits, and blocked dependencies.
              </p>
              <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">High Risks Detected</span>
                  <Badge variant={stats?.highRisksCount > 0 ? "danger" : "success"}>
                    {stats?.highRisksCount ?? 0} active
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  {stats?.highRisksCount > 0
                    ? "Critical project items require management review."
                    : "No critical blockers or severe deadline risks flagged."}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Link href="/risks" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    View Risks
                  </Button>
                </Link>
                <Link href="/ai-assistant" className="flex-1">
                  <Button size="sm" className="w-full text-xs bg-indigo-600 hover:bg-indigo-700">
                    Ask Assistant
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recentActivity?.length === 0 ? (
                <EmptyState title="No recent activity" description="Activity will be logged as team members work." />
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {stats?.recentActivity?.map((act: any) => (
                    <div key={act.id} className="py-2.5">
                      <span className="font-semibold text-slate-800">
                        {act.userFirstName ? `${act.userFirstName} ${act.userLastName}` : "Team Member"}
                      </span>{" "}
                      <span className="text-slate-600">{act.value ?? act.action}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {act.createdAt ? formatRelativeTime(act.createdAt) : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
