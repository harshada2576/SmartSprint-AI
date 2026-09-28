"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import {
  FileText,
  Download,
  Printer,
  BarChart3,
  Target,
  CheckCircle,
  AlertCircle,
  Users,
  ShieldAlert,
  Loader2,
  Calendar,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
}

interface Sprint {
  id: string;
  name: string;
  projectId: string;
  status: string;
}

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState<"project" | "sprint">("project");
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [sprints, setSprints] = React.useState<Sprint[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");
  const [selectedSprintId, setSelectedSprintId] = React.useState<string>("");

  const [loading, setLoading] = React.useState<boolean>(true);
  const [reportLoading, setReportLoading] = React.useState<boolean>(false);
  const [reportData, setReportData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Load projects and sprints
  React.useEffect(() => {
    async function loadInitial() {
      try {
        const [projRes, sprintRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/sprints"),
        ]);
        if (projRes.ok) {
          const pData = await projRes.json();
          const pList = pData.projects || pData.data || [];
          setProjects(pList);
          if (pList.length > 0) setSelectedProjectId(pList[0].id);
        }
        if (sprintRes.ok) {
          const sData = await sprintRes.json();
          const sList = sData.data || [];
          setSprints(sList);
          if (sList.length > 0) setSelectedSprintId(sList[0].id);
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  // Fetch report data
  const fetchReport = React.useCallback(async () => {
    if (reportType === "project") {
      if (!selectedProjectId) return;
      setReportLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/project/${selectedProjectId}`);
        if (!res.ok) throw new Error("Failed to fetch project report");
        const json = await res.json();
        setReportData(json.data);
      } catch (err: any) {
        setError(err.message || "Failed to load report");
      } finally {
        setReportLoading(false);
      }
    } else {
      if (!selectedSprintId) return;
      setReportLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/sprint/${selectedSprintId}`);
        if (!res.ok) throw new Error("Failed to fetch sprint report");
        const json = await res.json();
        setReportData(json.data);
      } catch (err: any) {
        setError(err.message || "Failed to load report");
      } finally {
        setReportLoading(false);
      }
    }
  }, [reportType, selectedProjectId, selectedSprintId]);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCsv = () => {
    if (reportType === "project" && selectedProjectId) {
      window.open(`/api/reports/project/${selectedProjectId}?format=csv`, "_blank");
    } else if (reportType === "sprint" && selectedSprintId) {
      window.open(`/api/reports/sprint/${selectedSprintId}?format=csv`, "_blank");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Reports Center"
        description="Comprehensive real-time project statistics and sprint summaries"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Reports" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!reportData}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!reportData}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {/* Report Selector Controls */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report Type</CardTitle>
              <CardDescription>Select report scope</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant={reportType === "project" ? "primary" : "outline"}
                className="w-full justify-start text-sm"
                onClick={() => setReportType("project")}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Project Report
              </Button>
              <Button
                variant={reportType === "sprint" ? "primary" : "outline"}
                className="w-full justify-start text-sm"
                onClick={() => setReportType("sprint")}
              >
                <Target className="w-4 h-4 mr-2" />
                Sprint Report
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {reportType === "project" ? "Select Project" : "Select Sprint"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportType === "project" ? (
                <select
                  aria-label="Select Project"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-card text-card-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="Select Sprint"
                  value={selectedSprintId}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                  className="w-full bg-card text-card-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Report Content */}
        <div className="lg:col-span-3">
          {reportLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-border rounded-lg bg-card">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>Compiling real-time report metrics...</p>
            </div>
          ) : error ? (
            <Card className="p-6 border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-3 text-red-500">
                <AlertCircle className="w-6 h-6" />
                <div>
                  <h4 className="font-semibold">Unable to load report</h4>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              </div>
            </Card>
          ) : reportType === "project" && reportData ? (
            <div className="space-y-6">
              {/* Project Header Info */}
              <Card className="border border-border">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl font-bold">{reportData.project.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {reportData.project.description || "No project description provided"}
                      </CardDescription>
                    </div>
                    <Badge variant={reportData.project.status === "active" ? "success" : "outline"}>
                      {reportData.project.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Overall Progress</div>
                      <div className="text-2xl font-bold mt-1">{reportData.summary.progressPercent}%</div>
                      <Progress value={reportData.summary.progressPercent} className="h-1.5 mt-2" />
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Tasks (Done/Total)</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.completedTasks} / {reportData.summary.totalTasks}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Story Points</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.completedPoints} / {reportData.summary.totalPoints}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Sprints (Active/Total)</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.activeSprints} / {reportData.summary.totalSprints}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Developer Workload in Project */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Developer Workload & Velocity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportData.developerWorkload.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-left">
                            <th className="pb-2 font-medium">Developer</th>
                            <th className="pb-2 font-medium text-center">Active</th>
                            <th className="pb-2 font-medium text-center">Completed</th>
                            <th className="pb-2 font-medium text-right">Points</th>
                            <th className="pb-2 font-medium text-right">Hours</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {reportData.developerWorkload.map((dev: any) => (
                            <tr key={dev.userId} className="hover:bg-muted/30">
                              <td className="py-2.5 font-medium">{dev.name}</td>
                              <td className="py-2.5 text-center">{dev.activeTasks}</td>
                              <td className="py-2.5 text-center text-muted-foreground">{dev.completedTasks}</td>
                              <td className="py-2.5 text-right font-mono">{dev.totalPoints} pts</td>
                              <td className="py-2.5 text-right font-mono">{dev.totalHours}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No team members assigned tasks in this project yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Blocked & Risk Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      Blocked Work ({reportData.summary.blockedTasks})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reportData.tasks.filter((t: any) => t.isBlocked).length > 0 ? (
                      <div className="space-y-2">
                        {reportData.tasks
                          .filter((t: any) => t.isBlocked)
                          .map((t: any) => (
                            <div key={t.id} className="p-2 border border-border rounded text-xs bg-red-500/5">
                              <div className="font-semibold text-foreground">{t.title}</div>
                              <div className="text-red-400 mt-1">Reason: {t.blockedReason || "None provided"}</div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">No tasks are currently blocked.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      Active Risks ({reportData.summary.openRisks})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reportData.risks.filter((r: any) => r.status === "open").length > 0 ? (
                      <div className="space-y-2">
                        {reportData.risks
                          .filter((r: any) => r.status === "open")
                          .slice(0, 3)
                          .map((r: any) => (
                            <div key={r.id} className="p-2 border border-border rounded text-xs">
                              <div className="font-semibold text-foreground flex justify-between">
                                <span>{r.title}</span>
                                <Badge variant="danger" className="text-[10px] uppercase">{r.severity}</Badge>
                              </div>
                              {r.mitigation && <div className="text-muted-foreground mt-1">{r.mitigation}</div>}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">No open risks registered.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : reportType === "sprint" && reportData ? (
            <div className="space-y-6">
              {/* Sprint Summary */}
              <Card className="border border-border">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl font-bold">{reportData.sprint.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Goal: {reportData.sprint.goal || "No sprint goal defined"}
                      </CardDescription>
                      <div className="text-xs text-muted-foreground mt-1">
                        Dates: {reportData.sprint.startDate || "N/A"} → {reportData.sprint.endDate || "N/A"}
                      </div>
                    </div>
                    <Badge variant={reportData.sprint.status === "active" ? "info" : "outline"}>
                      {reportData.sprint.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Completion Rate</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.completionPercentage}%
                      </div>
                      <Progress value={reportData.summary.completionPercentage} className="h-1.5 mt-2" />
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Velocity (Points Done)</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.velocity} pts
                      </div>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Completed Tasks</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.completedTasks} / {reportData.summary.plannedTasks}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg">
                      <div className="text-xs text-muted-foreground">Incomplete / Blocked</div>
                      <div className="text-2xl font-bold mt-1">
                        {reportData.summary.incompleteTasks} / {reportData.summary.blockedTasks}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Developer Contribution */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Sprint Developer Contribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportData.developerContribution.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-left">
                            <th className="pb-2 font-medium">Developer</th>
                            <th className="pb-2 font-medium text-center">Assigned</th>
                            <th className="pb-2 font-medium text-center">Completed</th>
                            <th className="pb-2 font-medium text-right">Points</th>
                            <th className="pb-2 font-medium text-right">Contribution %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {reportData.developerContribution.map((dev: any) => (
                            <tr key={dev.userId} className="hover:bg-muted/30">
                              <td className="py-2.5 font-medium">{dev.name}</td>
                              <td className="py-2.5 text-center">{dev.assigned}</td>
                              <td className="py-2.5 text-center text-muted-foreground">{dev.completed}</td>
                              <td className="py-2.5 text-right font-mono">{dev.points} pts</td>
                              <td className="py-2.5 text-right font-semibold">{dev.contributionPercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No developers assigned tasks in this sprint.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Sprint Tasks List */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Sprint Tasks Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border text-sm">
                    {reportData.tasks.map((task: any) => (
                      <div key={task.id} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{task.title}</span>
                          {task.isBlocked && (
                            <Badge variant="danger" className="text-[10px]">
                              BLOCKED
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{task.assignee}</span>
                          <span className="font-mono">{task.points} pts</span>
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {task.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
