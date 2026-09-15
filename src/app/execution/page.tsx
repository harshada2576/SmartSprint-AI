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
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
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
  Clock,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  buildQuery,
  normalizeTask,
  shortId,
  taskStageProgress,
  useCollection,
  type TaskItem,
} from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const TEAM_PAGE_SIZE = 20;

function formatUpdated(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

function formatDueDate(value: string | null): string {
  if (!value) return "No due date";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

function isToday(value: string): boolean {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return false;
  const now = new Date();
  return (
    time.getFullYear() === now.getFullYear() &&
    time.getMonth() === now.getMonth() &&
    time.getDate() === now.getDate()
  );
}

export default function ExecutionPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState("mywork");

  const teamQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: TEAM_PAGE_SIZE }),
    [],
  );
  const {
    items: teamTasks,
    error: teamError,
    isLoading: teamIsLoading,
    retry: retryTeam,
  } = useCollection<TaskItem>("/api/tasks", normalizeTask, teamQuery);

  // My Work uses the caller-scoped form GET /api/tasks?assignee=me. The
  // literal "me" is resolved server-side to the authenticated Supabase user;
  // no client user ID, localStorage identity, or /api/me lookup is used.
  const myWorkQuery = React.useMemo(
    () => buildQuery({ assignee: "me", page: 1, pageSize: TEAM_PAGE_SIZE }),
    [],
  );
  const {
    items: myTasks,
    error: myWorkError,
    isLoading: myWorkIsLoading,
    retry: retryMyWork,
  } = useCollection<TaskItem>("/api/tasks", normalizeTask, myWorkQuery);

  const showLoading = teamIsLoading && teamTasks.length === 0;
  const showMyWorkLoading = myWorkIsLoading && myTasks.length === 0;

  // Summary counts are computed from the loaded team page (real rows only).
  const inProgressCount = teamTasks.filter(
    (task) => task.columnStatus === "inProgress",
  ).length;
  const todoCount = teamTasks.filter(
    (task) => task.columnStatus === "todo" || task.columnStatus === "backlog",
  ).length;
  const reviewCount = teamTasks.filter(
    (task) => task.columnStatus === "review" || task.columnStatus === "testing",
  ).length;
  const completedTodayCount = teamTasks.filter(
    (task) => task.columnStatus === "done" && isToday(task.updatedAt),
  ).length;

  // Recent activity is derived from the most recently updated real tasks.
  const recentActivity = [...teamTasks]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 4)
    .map((task) => ({
      id: task.id,
      action: "Updated",
      item: task.displayId,
      time: formatUpdated(task.updatedAt),
    }));

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mywork">My Work</TabsTrigger>
          <TabsTrigger value="team">Team Work</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="mywork" className="mt-6">
          {showMyWorkLoading ? (
            <Card>
              <CardContent className="p-6 space-y-3">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : myWorkError !== null && myTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={AlertCircle}
                  title="Couldn't load your work"
                  description={myWorkError.message}
                  action={{ label: "Try again", onClick: retryMyWork }}
                />
              </CardContent>
            </Card>
          ) : myTasks.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={CheckSquare}
                title="No tasks assigned to you"
                description="Tasks assigned to you will show up here. Team work below is already live."
                action={{ label: "View team work", onClick: () => setTab("team") }}
              />
            </CardContent>
          </Card>
          ) : (
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
                          {task.displayId}
                        </span>
                        <h4 className="font-medium text-slate-900">
                          {task.title}
                        </h4>
                      </div>
                      <PriorityChip priority={task.priority} size="sm" />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                      <span>{shortId(task.projectId)}</span>
                      <span>•</span>
                      <span>
                        {task.sprintId ? shortId(task.sprintId) : "No sprint"}
                      </span>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Due {formatDueDate(task.dueDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        {/* Stage-based estimate: the tasks API exposes no
                            percent-complete field. */}
                        <Progress value={taskStageProgress(task.columnStatus)} size="sm" />
                      </div>
                      <span className="text-xs text-slate-500 w-10">
                        {taskStageProgress(task.columnStatus)}%
                      </span>
                      <StatusChip status={task.columnStatus} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          {showLoading ? (
            <Card>
              <CardContent className="p-6 space-y-3">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : teamError !== null && teamTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={AlertCircle}
                  title="Couldn't load team work"
                  description={teamError.message}
                  action={{ label: "Try again", onClick: retryTeam }}
                />
              </CardContent>
            </Card>
          ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Team Tasks */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Team Tasks</CardTitle>
                  <Badge variant="secondary" size="sm">
                    {teamTasks.length} tasks
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  {teamTasks.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">
                      No tasks yet. Tasks in your projects will show up here.
                    </p>
                  ) : (
                  <div className="divide-y divide-slate-100">
                    {teamTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/tasks/${task.id}`)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-mono text-xs text-slate-400">
                              {task.displayId}
                            </span>
                            <h4 className="font-medium text-slate-900">
                              {task.title}
                            </h4>
                          </div>
                          <PriorityChip priority={task.priority} size="sm" />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                          <span>{shortId(task.projectId)}</span>
                          <span>•</span>
                          <span>
                            {task.sprintId ? shortId(task.sprintId) : "No sprint"}
                          </span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Due {formatDueDate(task.dueDate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            {/* Stage-based estimate: the tasks API exposes no
                                percent-complete field. */}
                            <Progress value={taskStageProgress(task.columnStatus)} size="sm" />
                          </div>
                          <span className="text-xs text-slate-500 w-10">
                            {taskStageProgress(task.columnStatus)}%
                          </span>
                          <StatusChip status={task.columnStatus} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Today&apos;s Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">In Progress</span>
                    <Badge size="sm">{inProgressCount}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">To Do</span>
                    <Badge variant="secondary" size="sm">
                      {todoCount}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">In Review</span>
                    <Badge variant="info" size="sm">
                      {reviewCount}
                    </Badge>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        Completed Today
                      </span>
                      <span className="text-lg font-bold text-emerald-600">
                        {completedTodayCount}
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
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-slate-500">No recent activity yet.</p>
                  ) : (
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
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )}

          {!showLoading && teamError === null && teamTasks.length > 0 ? (
          <Card className="mt-6">
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
                            {task.displayId}
                          </span>
                          <p className="font-medium text-slate-900">
                            {task.title}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {task.assigneeId ? shortId(task.assigneeId) : "Unassigned"}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={task.columnStatus} size="sm" />
                      </TableCell>
                      <TableCell>
                        <PriorityChip priority={task.priority} size="sm" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 w-28">
                          <Progress value={taskStageProgress(task.columnStatus)} size="sm" />
                          <span className="text-xs text-slate-500">
                            {taskStageProgress(task.columnStatus)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatUpdated(task.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          ) : null}
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
