"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  ArrowLeft,
  Edit,
  FileText,
  Sparkles,
  Calendar,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  MoreHorizontal,
  FolderOpen,
  Target,
  TrendingUp,
  Activity,
} from "lucide-react";

// Mock project data
const project = {
  id: 1,
  name: "E-Commerce Platform Redesign",
  code: "ECOM-2025",
  client: "RetailCorp Inc.",
  status: "active",
  progress: 65,
  sprint: "Sprint 4",
  sprintProgress: 72,
  description:
    "Complete redesign of the e-commerce platform with modern UI/UX, improved performance, and mobile-first approach.",
  manager: "John Smith",
  startDate: "2025-01-15",
  endDate: "2025-09-15",
  team: 8,
  methodology: "Scrum",
  priority: "high",
};

const stats = [
  { label: "Progress", value: "65%", icon: TrendingUp, color: "blue" },
  { label: "Current Sprint", value: "Sprint 4", icon: Target, color: "violet" },
  { label: "Requirements", value: "42/65", icon: FileText, color: "emerald" },
  { label: "Budget", value: "$145K/$200K", icon: Activity, color: "amber" },
];

const actionableItems = [
  { id: 1, type: "requirement", title: "3 requirements awaiting review", icon: FileText, action: "Review Now" },
  { id: 2, type: "approval", title: "2 pending approvals", icon: CheckCircle, action: "View" },
  { id: 3, type: "sprint", title: "Sprint planning for Sprint 5", icon: Calendar, action: "Plan Sprint" },
  { id: 4, type: "document", title: "SRS document needs update", icon: FolderOpen, action: "Update" },
];

const timeline = [
  { stage: "Initiation", status: "completed", date: "Jan 15" },
  { stage: "Requirements", status: "completed", date: "Feb 28" },
  { stage: "Design", status: "completed", date: "Mar 30" },
  { stage: "Development", status: "current", date: "In Progress" },
  { stage: "Testing", status: "pending", date: "Aug 01" },
  { stage: "Deployment", status: "pending", date: "Sep 15" },
];

const upcomingDeadlines = [
  { id: 1, title: "Sprint 4 Review", date: "2025-07-25", type: "sprint" },
  { id: 2, title: "UI Mockups Approval", date: "2025-07-28", type: "approval" },
  { id: 3, title: "Payment Gateway Integration", date: "2025-08-05", type: "milestone" },
  { id: 4, title: "Client Demo", date: "2025-08-10", type: "milestone" },
];

const recentActivity = [
  { id: 1, action: "Requirement approved", item: "User Authentication", user: "John Smith", time: "2 hours ago" },
  { id: 2, action: "Sprint updated", item: "Sprint 4", user: "Sarah Chen", time: "4 hours ago" },
  { id: 3, action: "Document uploaded", item: "API Specification v2.1", user: "Mike Johnson", time: "6 hours ago" },
  { id: 4, action: "Task completed", item: "Database Schema Design", user: "Emily Davis", time: "Yesterday" },
  { id: 5, action: "Comment added", item: "Checkout Flow", user: "David Wilson", time: "Yesterday" },
];

export default function ProjectCommandCenterPage({ params }: { params: { id: string } }) {
  const router = useRouter();

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
        description={`${project.code} • ${project.client}`}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
        primaryAction={{
          label: "Edit Project",
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "View Documents",
            onClick: () => router.push("/documents"),
          },
        ]}
      >
        <div className="flex items-center gap-3 mt-4">
          <StatusChip status={project.status} />
          <Badge variant="secondary" size="sm">
            {project.methodology}
          </Badge>
          <Badge
            variant={project.priority === "high" ? "danger" : "default"}
            size="sm"
          >
            {project.priority} Priority
          </Badge>
        </div>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <Card key={index}>
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
          {/* Continue Working */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Continue Working</CardTitle>
              <CardDescription>Action items requiring your attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {actionableItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                        <item.icon className="h-4 w-4 text-slate-600" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {item.title}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm">
                      {item.action}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SDLC Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {timeline.map((stage, index) => (
                  <div key={index} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium ${
                          stage.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : stage.status === "current"
                            ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500 ring-offset-2"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span
                        className={`mt-2 text-xs font-medium ${
                          stage.status === "current"
                            ? "text-slate-900"
                            : "text-slate-500"
                        }`}
                      >
                        {stage.stage}
                      </span>
                      <span className="text-xs text-slate-400">
                        {stage.date}
                      </span>
                    </div>
                    {index < timeline.length - 1 && (
                      <div
                        className={`w-12 h-0.5 mx-2 ${
                          stage.status === "completed"
                            ? "bg-emerald-300"
                            : "bg-slate-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Activity className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-slate-900">
                          {activity.action}
                        </span>{" "}
                        <span className="text-slate-600">{activity.item}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {activity.user} • {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
              >
                View Team
              </Button>
            </CardContent>
          </Card>

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
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {deadline.title}
                      </p>
                      <p className="text-xs text-slate-500">{deadline.date}</p>
                    </div>
                    <Badge
                      variant={
                        deadline.type === "sprint"
                          ? "info"
                          : deadline.type === "approval"
                          ? "warning"
                          : "default"
                      }
                      size="sm"
                    >
                      {deadline.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Team */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team Members</CardTitle>
              <span className="text-sm text-slate-500">{project.team}</span>
            </CardHeader>
            <CardContent>
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600"
                  >
                    U{i}
                  </div>
                ))}
                <div className="h-8 w-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-500">
                  +3
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
