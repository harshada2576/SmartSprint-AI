"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { PriorityChip, StatusChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  CheckSquare,
  Users,
  Clock,
  Calendar,
  MoreHorizontal,
  Play,
  Pause,
  Flag,
  FileText,
  MessageSquare,
  Paperclip,
  ArrowRight,
} from "lucide-react";

const myTasks = [
  {
    id: "TASK-107",
    title: "Implement product search",
    priority: "high",
    status: "inProgress",
    dueDate: "2025-07-25",
    progress: 65,
    sprint: "Sprint 4",
    project: "E-Commerce Platform",
  },
  {
    id: "TASK-113",
    title: "Write unit tests for auth module",
    priority: "medium",
    status: "todo",
    dueDate: "2025-07-26",
    progress: 0,
    sprint: "Sprint 4",
    project: "E-Commerce Platform",
  },
  {
    id: "TASK-114",
    title: "Review API documentation",
    priority: "low",
    status: "todo",
    dueDate: "2025-07-28",
    progress: 0,
    sprint: "Sprint 4",
    project: "E-Commerce Platform",
  },
  {
    id: "TASK-115",
    title: "Fix login redirect bug",
    priority: "high",
    status: "review",
    dueDate: "2025-07-24",
    progress: 90,
    sprint: "Sprint 4",
    project: "Mobile Banking App",
  },
];

const teamTasks = [
  {
    id: "TASK-101",
    title: "Implement user authentication API",
    assignee: "John Smith",
    status: "completed",
    priority: "high",
    progress: 100,
    updated: "2 hours ago",
  },
  {
    id: "TASK-102",
    title: "Design login page UI",
    assignee: "Sarah Chen",
    status: "completed",
    priority: "medium",
    progress: 100,
    updated: "4 hours ago",
  },
  {
    id: "TASK-107",
    title: "Implement product search",
    assignee: "Emily Davis",
    status: "inProgress",
    priority: "high",
    progress: 65,
    updated: "1 hour ago",
  },
  {
    id: "TASK-108",
    title: "Add shopping cart functionality",
    assignee: "David Wilson",
    status: "inProgress",
    priority: "high",
    progress: 40,
    updated: "30 min ago",
  },
  {
    id: "TASK-109",
    title: "Setup payment gateway",
    assignee: "John Smith",
    status: "todo",
    priority: "high",
    progress: 10,
    updated: "1 day ago",
  },
];

const recentActivity = [
  { id: 1, action: "Started working on", item: "TASK-107", time: "2 hours ago" },
  { id: 2, action: "Completed", item: "TASK-101", time: "4 hours ago" },
  { id: 3, action: "Added comment on", item: "TASK-108", time: "5 hours ago" },
  { id: 4, action: "Updated status of", item: "TASK-115", time: "Yesterday" },
];

export default function ExecutionPage() {
  const router = useRouter();

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Execution Workspace"
        description="Track and manage development work"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Execution" },
        ]}
      />

      <Tabs defaultValue="mywork">
        <TabsList>
          <TabsTrigger value="mywork">My Work</TabsTrigger>
          <TabsTrigger value="team">Team Work</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="mywork" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* My Tasks */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">My Tasks</CardTitle>
                  <Badge variant="secondary" size="sm">
                    {myTasks.length} tasks
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {myTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/tasks/${task.id}`)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-mono text-xs text-slate-400">
                              {task.id}
                            </span>
                            <h4 className="font-medium text-slate-900">
                              {task.title}
                            </h4>
                          </div>
                          <PriorityChip priority={task.priority} size="sm" />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                          <span>{task.project}</span>
                          <span>•</span>
                          <span>{task.sprint}</span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Due {task.dueDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Progress value={task.progress} size="sm" />
                          </div>
                          <span className="text-xs text-slate-500 w-10">
                            {task.progress}%
                          </span>
                          <StatusChip status={task.status} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Today's Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">In Progress</span>
                    <Badge size="sm">1</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">To Do</span>
                    <Badge variant="secondary" size="sm">
                      2
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">In Review</span>
                    <Badge variant="info" size="sm">
                      1
                    </Badge>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        Completed Today
                      </span>
                      <span className="text-lg font-bold text-emerald-600">
                        2
                      </span>
                    </div>
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
                          <Clock className="h-3 w-3 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-slate-700">
                            {activity.action}{" "}
                            <span className="font-medium text-slate-900">
                              {activity.item}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {activity.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team Work</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm">
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamTasks.map((task) => (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs text-slate-400">
                            {task.id}
                          </span>
                          <p className="font-medium text-slate-900">
                            {task.title}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{task.assignee}</TableCell>
                      <TableCell>
                        <StatusChip status={task.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <PriorityChip priority={task.priority} size="sm" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 w-28">
                          <Progress value={task.progress} size="sm" />
                          <span className="text-xs text-slate-500">
                            {task.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {task.updated}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500">Activity feed coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
