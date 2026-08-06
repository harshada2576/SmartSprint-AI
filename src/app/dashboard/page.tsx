"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
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
  Plus,
  ArrowRight,
  Clock,
  MoreHorizontal,
  Filter,
  Download,
  Search,
} from "lucide-react";

// Mock data
const stats = [
  { label: "Active Projects", value: "12", icon: FolderKanban, trend: "+2" },
  { label: "Team Members", value: "48", icon: Users, trend: "+5" },
  { label: "Upcoming Deadlines", value: "7", icon: Calendar, trend: "3 this week" },
  { label: "Need Attention", value: "3", icon: AlertCircle, trend: "2 high priority" },
];

const recentProjects = [
  {
    id: 1,
    name: "E-Commerce Platform Redesign",
    client: "RetailCorp Inc.",
    status: "active",
    progress: 65,
    lastUpdated: "2 hours ago",
  },
  {
    id: 2,
    name: "Mobile Banking App",
    client: "FinanceFirst Bank",
    status: "active",
    progress: 42,
    lastUpdated: "5 hours ago",
  },
  {
    id: 3,
    name: "Healthcare Portal",
    client: "MedCare Systems",
    status: "pending",
    progress: 15,
    lastUpdated: "1 day ago",
  },
  {
    id: 4,
    name: "CRM Integration",
    client: "SalesPro LLC",
    status: "completed",
    progress: 100,
    lastUpdated: "3 days ago",
  },
];

const recentActivity = [
  { id: 1, action: "Requirement approved", project: "E-Commerce Platform", user: "John Smith", time: "10 min ago" },
  { id: 2, action: "Sprint created", project: "Mobile Banking App", user: "Sarah Chen", time: "1 hour ago" },
  { id: 3, action: "Document uploaded", project: "Healthcare Portal", user: "Mike Johnson", time: "2 hours ago" },
  { id: 4, action: "AI analysis completed", project: "CRM Integration", user: "System", time: "3 hours ago" },
];

const projects = [
  {
    id: 1,
    name: "E-Commerce Platform Redesign",
    client: "RetailCorp Inc.",
    manager: "John Smith",
    status: "active",
    progress: 65,
    sprint: "Sprint 4",
    endDate: "2025-09-15",
  },
  {
    id: 2,
    name: "Mobile Banking App",
    client: "FinanceFirst Bank",
    manager: "Sarah Chen",
    status: "active",
    progress: 42,
    sprint: "Sprint 2",
    endDate: "2025-10-30",
  },
  {
    id: 3,
    name: "Healthcare Portal",
    client: "MedCare Systems",
    manager: "Mike Johnson",
    status: "pending",
    progress: 15,
    sprint: "-",
    endDate: "2025-12-01",
  },
  {
    id: 4,
    name: "CRM Integration",
    client: "SalesPro LLC",
    manager: "Emily Davis",
    status: "completed",
    progress: 100,
    sprint: "Sprint 8",
    endDate: "2025-06-30",
  },
  {
    id: 5,
    name: "Data Analytics Dashboard",
    client: "TechCorp Solutions",
    manager: "David Wilson",
    status: "active",
    progress: 78,
    sprint: "Sprint 6",
    endDate: "2025-08-20",
  },
];

export default function DashboardPage() {
  const router = useRouter();

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
                <Badge variant="default" size="sm">
                  {stat.trend}
                </Badge>
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
              <div className="grid sm:grid-cols-2 gap-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <StatusChip status={project.status} size="sm" />
                      <span className="text-xs text-slate-400">
                        {project.lastUpdated}
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
                {recentActivity.map((activity) => (
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
                        {activity.user} • {activity.time}
                      </p>
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
                {projects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      {project.name}
                    </TableCell>
                    <TableCell>{project.client}</TableCell>
                    <TableCell>{project.manager}</TableCell>
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
                    <TableCell>{project.sprint}</TableCell>
                    <TableCell>{project.endDate}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
