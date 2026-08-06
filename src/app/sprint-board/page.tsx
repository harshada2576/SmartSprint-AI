"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { PriorityChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import {
  LayoutGrid,
  List,
  Plus,
  Calendar,
  Clock,
  Target,
  MoreHorizontal,
  User,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  Flag,
} from "lucide-react";

const sprint = {
  name: "Sprint 4",
  goal: "Complete payment integration and checkout flow",
  startDate: "2025-07-14",
  endDate: "2025-07-28",
  duration: "2 weeks",
  status: "active",
  progress: 72,
  totalPoints: 56,
  completedPoints: 40,
  remainingDays: 5,
};

const columns = [
  { id: "backlog", title: "Backlog", count: 3 },
  { id: "todo", title: "To Do", count: 4 },
  { id: "inProgress", title: "In Progress", count: 3 },
  { id: "review", title: "Review", count: 2 },
  { id: "testing", title: "Testing", count: 1 },
  { id: "done", title: "Done", count: 8 },
];

const tasks = [
  {
    id: "TASK-101",
    title: "Implement user authentication API",
    priority: "high",
    points: 8,
    assignee: "JS",
    column: "done",
  },
  {
    id: "TASK-102",
    title: "Design login page UI",
    priority: "medium",
    points: 5,
    assignee: "SC",
    column: "done",
  },
  {
    id: "TASK-103",
    title: "Setup database schema",
    priority: "high",
    points: 8,
    assignee: "MJ",
    column: "done",
  },
  {
    id: "TASK-104",
    title: "Implement password reset flow",
    priority: "medium",
    points: 5,
    assignee: "JS",
    column: "review",
  },
  {
    id: "TASK-105",
    title: "Add email verification",
    priority: "high",
    points: 5,
    assignee: "MJ",
    column: "testing",
  },
  {
    id: "TASK-106",
    title: "Create user profile page",
    priority: "medium",
    points: 5,
    assignee: "SC",
    column: "inProgress",
  },
  {
    id: "TASK-107",
    title: "Implement product search",
    priority: "high",
    points: 8,
    assignee: "ED",
    column: "inProgress",
  },
  {
    id: "TASK-108",
    title: "Add shopping cart functionality",
    priority: "high",
    points: 13,
    assignee: "DW",
    column: "inProgress",
  },
  {
    id: "TASK-109",
    title: "Setup payment gateway",
    priority: "high",
    points: 13,
    assignee: "JS",
    column: "todo",
  },
  {
    id: "TASK-110",
    title: "Create order confirmation page",
    priority: "medium",
    points: 5,
    assignee: "SC",
    column: "todo",
  },
  {
    id: "TASK-111",
    title: "Implement checkout flow",
    priority: "high",
    points: 13,
    assignee: "Unassigned",
    column: "backlog",
  },
  {
    id: "TASK-112",
    title: "Add order history page",
    priority: "low",
    points: 3,
    assignee: "Unassigned",
    column: "backlog",
  },
];

const listTasks = [
  {
    id: "TASK-101",
    title: "Implement user authentication API",
    assignee: "John Smith",
    status: "completed",
    priority: "high",
    sprint: "Sprint 4",
    points: 8,
    updated: "2 hours ago",
  },
  {
    id: "TASK-102",
    title: "Design login page UI",
    assignee: "Sarah Chen",
    status: "completed",
    priority: "medium",
    sprint: "Sprint 4",
    points: 5,
    updated: "4 hours ago",
  },
  {
    id: "TASK-107",
    title: "Implement product search",
    assignee: "Emily Davis",
    status: "inProgress",
    priority: "high",
    sprint: "Sprint 4",
    points: 8,
    updated: "1 hour ago",
  },
  {
    id: "TASK-108",
    title: "Add shopping cart functionality",
    assignee: "David Wilson",
    status: "inProgress",
    priority: "high",
    sprint: "Sprint 4",
    points: 13,
    updated: "30 min ago",
  },
];

export default function SprintBoardPage() {
  const router = useRouter();
  const [view, setView] = React.useState<"kanban" | "list">("kanban");

  return (
    <AuthenticatedLayout>
      <PageHeader
        title={sprint.name}
        description={sprint.goal}
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Sprint Board" },
        ]}
      >
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Calendar className="h-4 w-4" />
            <span>
              {sprint.startDate} - {sprint.endDate}
            </span>
          </div>
          <Badge variant="success" size="sm">
            {sprint.status}
          </Badge>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">{sprint.remainingDays} days left</span>
          </div>
        </div>
      </PageHeader>

      {/* Sprint Stats */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Progress</p>
                <p className="text-xl font-bold text-slate-900">{sprint.progress}%</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <Progress value={sprint.progress} size="sm" className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Points</p>
                <p className="text-xl font-bold text-slate-900">{sprint.totalPoints}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <Flag className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{sprint.completedPoints}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Play className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Remaining</p>
                <p className="text-xl font-bold text-slate-900">
                  {sprint.totalPoints - sprint.completedPoints}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "kanban"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>
          <Button variant="secondary" leftIcon={<Filter className="h-4 w-4" />}>
            Filter
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700">
            Sprint 4
          </span>
          <Button variant="secondary" size="sm">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        /* Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex-shrink-0 w-80 bg-slate-50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900">{column.title}</h3>
                  <Badge variant="default" size="sm">
                    {column.count}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon-sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {tasks
                  .filter((task) => task.column === column.id)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="bg-white p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <p className="text-sm font-medium text-slate-900 mb-2">
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PriorityChip priority={task.priority} size="sm" />
                          <span className="text-xs text-slate-500">
                            {task.points} pts
                          </span>
                        </div>
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {task.assignee}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/50">
                <tr>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Task
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Assignee
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Priority
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Points
                  </th>
                  <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <td className="p-4">
                      <div>
                        <p className="font-mono text-xs text-slate-400">
                          {task.id}
                        </p>
                        <p className="font-medium text-slate-900">
                          {task.title}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {task.assignee.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="text-sm text-slate-600">
                          {task.assignee}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          task.status === "completed"
                            ? "success"
                            : task.status === "inProgress"
                            ? "info"
                            : "default"
                        }
                        size="sm"
                      >
                        {task.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <PriorityChip priority={task.priority} size="sm" />
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {task.points}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {task.updated}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </AuthenticatedLayout>
  );
}
