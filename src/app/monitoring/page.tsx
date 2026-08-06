"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import {
  Activity,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  AlertTriangle,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  Flag,
  MoreHorizontal,
  ArrowRight,
} from "lucide-react";

const healthIndicators = [
  { label: "Overall Health", value: "Good", status: "success", icon: Activity },
  { label: "Project Progress", value: "65%", status: "info", icon: TrendingUp },
  { label: "Budget Status", value: "On Track", status: "success", icon: DollarSign },
  { label: "Sprint Status", value: "Active", status: "info", icon: Calendar },
  { label: "Requirements", value: "54% Complete", status: "warning", icon: CheckCircle },
];

const currentSprint = {
  name: "Sprint 4",
  goal: "Complete payment integration and checkout flow",
  daysRemaining: 5,
  progress: 72,
  totalPoints: 56,
  completedPoints: 40,
};

const milestones = [
  { id: 1, name: "Project Kickoff", date: "2025-01-15", status: "completed" },
  { id: 2, name: "Requirements Complete", date: "2025-02-28", status: "completed" },
  { id: 3, name: "Design Review", date: "2025-03-30", status: "completed" },
  { id: 4, name: "Beta Release", date: "2025-08-01", status: "current" },
  { id: 5, name: "Production Launch", date: "2025-09-15", status: "upcoming" },
];

const upcomingDeadlines = [
  { id: 1, title: "Sprint 4 Review", date: "2025-07-25", daysLeft: 3, type: "sprint" },
  { id: 2, title: "UI Mockups Approval", date: "2025-07-28", daysLeft: 6, type: "approval" },
  { id: 3, title: "Payment Gateway Integration", date: "2025-08-05", daysLeft: 14, type: "milestone" },
];

const teamWorkload = [
  { member: "John Smith", assigned: 5, inProgress: 2, completed: 3 },
  { member: "Sarah Chen", assigned: 4, inProgress: 1, completed: 3 },
  { member: "Mike Johnson", assigned: 6, inProgress: 3, completed: 2 },
  { member: "Emily Davis", assigned: 4, inProgress: 2, completed: 1 },
  { member: "David Wilson", assigned: 3, inProgress: 1, completed: 2 },
];

const risks = [
  { id: 1, title: "Payment API delays", severity: "high", owner: "John Smith", mitigation: "Contact vendor for expedited support" },
  { id: 2, title: "Resource availability", severity: "medium", owner: "Sarah Chen", mitigation: "Cross-train team members" },
];

const recentActivity = [
  { id: 1, action: "Sprint velocity updated", value: "32 points", time: "2 hours ago" },
  { id: 2, action: "Budget forecast updated", value: "+5% variance", time: "4 hours ago" },
  { id: 3, action: "Risk registered", value: "Payment API delays", time: "6 hours ago" },
  { id: 4, action: "Milestone achieved", value: "Design Review", time: "Yesterday" },
];

export default function MonitoringPage() {
  const router = useRouter();

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Project Health & Monitoring"
        description="Monitor overall project health and performance"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Monitoring" },
        ]}
        primaryAction={{
          label: "Generate Report",
          onClick: () => router.push("/reports"),
        }}
      />

      {/* Health Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {healthIndicators.map((indicator, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    {indicator.label}
                  </p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">
                    {indicator.value}
                  </p>
                </div>
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                    indicator.status === "success"
                      ? "bg-emerald-100"
                      : indicator.status === "warning"
                      ? "bg-amber-100"
                      : "bg-blue-100"
                  }`}
                >
                  <indicator.icon
                    className={`h-4 w-4 ${
                      indicator.status === "success"
                        ? "text-emerald-600"
                        : indicator.status === "warning"
                        ? "text-amber-600"
                        : "text-blue-600"
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Sprint */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Current Sprint</CardTitle>
                <CardDescription>{currentSprint.goal}</CardDescription>
              </div>
              <Button variant="secondary" size="sm">
                Open Sprint
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Days Remaining</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {currentSprint.daysRemaining}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Completed Points</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {currentSprint.completedPoints}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Total Points</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {currentSprint.totalPoints}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Progress value={currentSprint.progress} />
                </div>
                <span className="text-sm font-medium text-slate-900">
                  {currentSprint.progress}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {milestones.map((milestone, index) => (
                  <div key={milestone.id} className="flex items-center gap-4">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        milestone.status === "completed"
                          ? "bg-emerald-100 text-emerald-600"
                          : milestone.status === "current"
                          ? "bg-blue-100 text-blue-600 ring-2 ring-blue-500"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {milestone.status === "completed" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Flag className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-medium ${
                            milestone.status === "current"
                              ? "text-slate-900"
                              : "text-slate-600"
                          }`}
                        >
                          {milestone.name}
                        </span>
                        <span className="text-sm text-slate-500">
                          {milestone.date}
                        </span>
                      </div>
                      {index < milestones.length - 1 && (
                        <div className="h-4 w-0.5 bg-slate-200 ml-4 mt-1" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Team Workload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Workload</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/50">
                  <tr>
                    <th className="h-10 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                      Member
                    </th>
                    <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                      Assigned
                    </th>
                    <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                      In Progress
                    </th>
                    <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamWorkload.map((member) => (
                    <tr key={member.member}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {member.member}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge size="sm">{member.assigned}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="info" size="sm">
                          {member.inProgress}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="success" size="sm">
                          {member.completed}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingDeadlines.map((deadline) => (
                  <div
                    key={deadline.id}
                    className={`p-3 rounded-lg border ${
                      deadline.daysLeft <= 3
                        ? "border-rose-200 bg-rose-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-900 text-sm">
                        {deadline.title}
                      </span>
                      {deadline.daysLeft <= 3 && (
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{deadline.date}</span>
                      <span
                        className={`font-medium ${
                          deadline.daysLeft <= 3
                            ? "text-rose-600"
                            : "text-slate-600"
                        }`}
                      >
                        {deadline.daysLeft} days left
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risks & Blockers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Risks & Blockers</CardTitle>
              <Badge variant="danger" size="sm">
                {risks.length} active
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {risks.map((risk) => (
                  <div
                    key={risk.id}
                    className="p-3 rounded-lg border border-rose-200 bg-rose-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      <span className="font-medium text-slate-900 text-sm">
                        {risk.title}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>Severity: {risk.severity}</p>
                      <p>Owner: {risk.owner}</p>
                      <p className="text-slate-500">{risk.mitigation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3 text-sm">
                    <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Activity className="h-3 w-3 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-slate-700">
                        {activity.action}
                        {activity.value && (
                          <span className="font-medium text-slate-900">
                            {" "}
                            {activity.value}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
