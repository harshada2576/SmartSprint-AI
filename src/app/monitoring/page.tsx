"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import {
  Activity,
  TrendingUp,
  Calendar,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Loader2,
  FolderGit2,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  status: string;
}

interface MonitoringData {
  project: {
    id: string;
    name: string;
    status: string;
  };
  health: {
    score: number;
    status: "healthy" | "attention" | "critical";
    factors: Array<{
      name: string;
      penalty: number;
      details: string;
    }>;
  };
  taskMetrics: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    blocked: number;
    overdue: number;
    completionRate: number;
  };
  activeSprint: {
    id: string;
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    capacityPoints: number;
    usedPoints: number;
    completedPoints: number;
    totalTasks: number;
    completedTasks: number;
    progressPercent: number;
    daysRemaining: number;
  } | null;
  developerWorkload: Array<{
    userId: string;
    name: string;
    activeTasks: number;
    completedTasks: number;
    estimatedHours: number;
  }>;
  openRisks: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    source: string;
    mitigation: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    user: {
      name: string;
      email: string;
    } | null;
  }>;
}

export default function MonitoringPage() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");
  const [monitoringData, setMonitoringData] = React.useState<MonitoringData | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load projects list
  React.useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          const list = data.projects || data.data || [];
          setProjects(list);
          if (list.length > 0) {
            setSelectedProjectId(list[0].id);
          } else {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Failed to load projects", err);
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  // Fetch monitoring data for selected project
  const fetchMonitoring = React.useCallback(async (projId: string) => {
    if (!projId) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitoring/${projId}`);
      if (!res.ok) {
        throw new Error("Failed to load monitoring metrics");
      }
      const data = await res.json();
      const d = data.data;
      if (d) {
        const tasks = d.taskMetrics || d.tasks || { total: 0, completed: 0, inProgress: 0, todo: 0, blocked: 0, overdue: 0 };
        const total = tasks.total || 0;
        const completed = tasks.completed || 0;
        const completionRate = tasks.completionRate ?? (total > 0 ? Math.round((completed / total) * 100) : 0);
        setMonitoringData({
          ...d,
          taskMetrics: {
            ...tasks,
            completionRate,
          },
          openRisks: d.openRisks || d.risks || [],
          developerWorkload: d.developerWorkload || d.workload || [],
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load monitoring data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProjectId) {
      fetchMonitoring(selectedProjectId);
    }
  }, [selectedProjectId, fetchMonitoring]);

  const getHealthBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return <Badge variant="success">HEALTHY (90-100)</Badge>;
      case "attention":
        return <Badge variant="warning">ATTENTION (70-89)</Badge>;
      case "critical":
        return <Badge variant="danger">CRITICAL (&lt;70)</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return "text-emerald-500";
    if (score >= 70) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Project Health & Monitoring"
        description="Transparent health metrics, sprint velocity, and risk indicators"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Monitoring" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <select
              aria-label="Select Project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMonitoring(selectedProjectId)}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/reports")}
            >
              View Reports
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
          <p>Analyzing project metrics and health data...</p>
        </div>
      ) : projects.length === 0 ? (
        <Card className="p-8 text-center">
          <FolderGit2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No Projects Found</h3>
          <p className="text-muted-foreground mt-1 mb-4">Create your first project to view health metrics.</p>
          <Button variant="primary" onClick={() => router.push("/projects")}>
            Go to Projects
          </Button>
        </Card>
      ) : error ? (
        <Card className="p-6 border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="w-6 h-6" />
            <div>
              <h4 className="font-semibold">Unable to load monitoring data</h4>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        </Card>
      ) : monitoringData ? (
        <div className="space-y-6">
          {/* Top Row: Health Score & Core KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Transparent Project Health */}
            <Card className="md:col-span-1 border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Project Health Score</span>
                  <Activity className="w-4 h-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-5xl font-black ${getHealthColor(monitoringData.health.score)}`}>
                    {monitoringData.health.score}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">/ 100</span>
                </div>
                <div className="mb-3">
                  {getHealthBadge(monitoringData.health.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Starts at 100 with transparent deductions for blockers, overdue work, and risks.
                </p>
              </CardContent>
            </Card>

            {/* Task Completion Rate */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Task Completion</span>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">
                  {monitoringData.taskMetrics.completionRate}%
                </div>
                <Progress value={monitoringData.taskMetrics.completionRate} className="h-2 mb-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{monitoringData.taskMetrics.completed} Done</span>
                  <span>{monitoringData.taskMetrics.total} Total Tasks</span>
                </div>
              </CardContent>
            </Card>

            {/* Blocked Tasks */}
            <Card className={`border ${monitoringData.taskMetrics.blocked > 0 ? "border-red-500/40 bg-red-500/5" : "border-border"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Blocked Work</span>
                  <AlertTriangle className={`w-4 h-4 ${monitoringData.taskMetrics.blocked > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold mb-2 ${monitoringData.taskMetrics.blocked > 0 ? "text-red-500" : ""}`}>
                  {monitoringData.taskMetrics.blocked}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {monitoringData.taskMetrics.blocked > 0
                    ? "Critical: Tasks flagged with blocker reasons requiring PM intervention"
                    : "No blocked tasks currently recorded"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => router.push("/tasks")}
                >
                  View Tasks
                </Button>
              </CardContent>
            </Card>

            {/* Overdue Tasks */}
            <Card className={`border ${monitoringData.taskMetrics.overdue > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Overdue Tasks</span>
                  <Clock className={`w-4 h-4 ${monitoringData.taskMetrics.overdue > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold mb-2 ${monitoringData.taskMetrics.overdue > 0 ? "text-amber-500" : ""}`}>
                  {monitoringData.taskMetrics.overdue}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {monitoringData.taskMetrics.overdue > 0
                    ? "Tasks past due date with remaining incomplete work"
                    : "All active tasks are currently within schedule"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => router.push("/tasks")}
                >
                  Inspect Deadlines
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Health Penalty Breakdown */}
          {monitoringData.health.factors.length > 0 && (
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Transparent Health Deductions
                </CardTitle>
                <CardDescription>
                  Real-time formula factor impact on overall project health rating
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {monitoringData.health.factors.map((factor, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-border bg-muted/30 flex justify-between items-center"
                    >
                      <div>
                        <div className="text-sm font-semibold">{factor.name}</div>
                        <div className="text-xs text-muted-foreground">{factor.details}</div>
                      </div>
                      <Badge variant="danger" className="font-mono text-xs">
                        -{factor.penalty} pts
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Middle Row: Active Sprint & Open Risks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Sprint Section */}
            <Card className="border border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Active Sprint Status
                  </CardTitle>
                  <CardDescription>
                    Real-time execution of the currently running sprint
                  </CardDescription>
                </div>
                {monitoringData.activeSprint && (
                  <Badge variant="info">ACTIVE</Badge>
                )}
              </CardHeader>
              <CardContent>
                {monitoringData.activeSprint ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-lg font-bold">{monitoringData.activeSprint.name}</div>
                      {monitoringData.activeSprint.goal && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Goal: {monitoringData.activeSprint.goal}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sprint Progress</span>
                        <span className="font-semibold">{monitoringData.activeSprint.progressPercent}%</span>
                      </div>
                      <Progress value={monitoringData.activeSprint.progressPercent} className="h-2" />
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                      <div className="p-2.5 bg-muted/40 rounded-lg">
                        <div className="text-xs text-muted-foreground">Days Left</div>
                        <div className="text-lg font-bold mt-1">
                          {monitoringData.activeSprint.daysRemaining}
                        </div>
                      </div>
                      <div className="p-2.5 bg-muted/40 rounded-lg">
                        <div className="text-xs text-muted-foreground">Tasks Done</div>
                        <div className="text-lg font-bold mt-1">
                          {monitoringData.activeSprint.completedTasks} / {monitoringData.activeSprint.totalTasks}
                        </div>
                      </div>
                      <div className="p-2.5 bg-muted/40 rounded-lg">
                        <div className="text-xs text-muted-foreground">Points</div>
                        <div className="text-lg font-bold mt-1">
                          {monitoringData.activeSprint.completedPoints} / {monitoringData.activeSprint.capacityPoints || monitoringData.activeSprint.usedPoints}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push("/sprint-board")}
                      >
                        Open Sprint Board
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push("/sprint-planning")}
                      >
                        Manage Sprint
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No sprint currently active</p>
                    <p className="text-xs mt-1 mb-4">Plan and start a sprint to track sprint-level velocity</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/sprint-planning")}
                    >
                      Go to Sprint Planning
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Risks Section */}
            <Card className="border border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    AI Detected Risks
                  </CardTitle>
                  <CardDescription>
                    Automated project risk signals requiring attention
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => router.push("/risks")}
                >
                  View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {monitoringData.openRisks.length > 0 ? (
                  <div className="space-y-3">
                    {monitoringData.openRisks.slice(0, 4).map((risk) => (
                      <div
                        key={risk.id}
                        className="p-3 rounded-lg border border-border bg-card flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{risk.title}</span>
                            <Badge
                              variant={risk.severity === "high" || risk.severity === "critical" ? "danger" : "warning"}
                              className="text-[10px] uppercase py-0"
                            >
                              {risk.severity}
                            </Badge>
                          </div>
                          {risk.mitigation && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              Action: {risk.mitigation}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {risk.source}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-10 h-10 text-emerald-500/60 mx-auto mb-2" />
                    <p className="text-sm font-medium">No open risks detected</p>
                    <p className="text-xs mt-1">Project is progressing within safe variance thresholds</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row: Developer Workload & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Developer Workload */}
            <Card className="lg:col-span-2 border border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Team Workload Allocation
                  </CardTitle>
                  <CardDescription>
                    Live distribution of active work and estimated effort across developers
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => router.push("/team")}
                >
                  Manage Team
                </Button>
              </CardHeader>
              <CardContent>
                {monitoringData.developerWorkload.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-left">
                          <th className="pb-2 font-medium">Developer</th>
                          <th className="pb-2 font-medium text-center">Active Tasks</th>
                          <th className="pb-2 font-medium text-center">Completed</th>
                          <th className="pb-2 font-medium text-right">Est. Hours</th>
                          <th className="pb-2 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {monitoringData.developerWorkload.map((dev) => (
                          <tr key={dev.userId} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 font-medium">{dev.name}</td>
                            <td className="py-2.5 text-center">{dev.activeTasks}</td>
                            <td className="py-2.5 text-center text-muted-foreground">
                              {dev.completedTasks}
                            </td>
                            <td className="py-2.5 text-right font-mono">{dev.estimatedHours}h</td>
                            <td className="py-2.5 text-right">
                              {dev.activeTasks > 5 ? (
                                <Badge variant="danger" className="text-[10px]">
                                  OVERLOADED
                                </Badge>
                              ) : dev.activeTasks >= 3 ? (
                                <Badge variant="warning" className="text-[10px]">
                                  HIGH
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-[10px]">
                                  BALANCED
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No developer assignments recorded for this project yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Activity Stream */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest events and milestone updates</CardDescription>
              </CardHeader>
              <CardContent>
                {monitoringData.recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {monitoringData.recentActivity.slice(0, 5).map((act) => (
                      <div key={act.id} className="text-xs border-b border-border/50 pb-2 last:border-none">
                        <div className="font-semibold text-foreground">{act.action}</div>
                        <div className="flex justify-between text-muted-foreground mt-0.5">
                          <span>{act.user?.name || "System"}</span>
                          <span>{new Date(act.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-6 text-muted-foreground text-xs">
                    No recent activity recorded.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </AuthenticatedLayout>
  );
}
