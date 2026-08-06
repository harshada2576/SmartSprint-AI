"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { PriorityChip } from "@/components/ui/StatusChip";
import {
  Calendar,
  Users,
  Target,
  Plus,
  ArrowRight,
  Flag,
  Clock,
  CheckCircle,
} from "lucide-react";

const capacity = {
  total: 80,
  allocated: 54,
  remaining: 26,
};

const availableRequirements = [
  { id: "REQ-003", title: "Shopping Cart Persistence", points: 5, dependencies: "None", recommendedSprint: "Sprint 5" },
  { id: "REQ-005", title: "Order Tracking System", points: 8, dependencies: "REQ-003", recommendedSprint: "Sprint 5" },
  { id: "REQ-006", title: "Customer Review System", points: 5, dependencies: "REQ-005", recommendedSprint: "Sprint 6" },
  { id: "REQ-007", title: "Email Notification System", points: 3, dependencies: "None", recommendedSprint: "Sprint 5" },
];

const sprintAllocation = [
  { id: "REQ-003", title: "Shopping Cart Persistence", points: 5 },
  { id: "REQ-007", title: "Email Notification System", points: 3 },
];

export default function SprintPlanningPage() {
  const router = useRouter();
  const [sprintName, setSprintName] = React.useState("Sprint 5");
  const [sprintGoal, setSprintGoal] = React.useState("");

  const totalAllocated = sprintAllocation.reduce((sum, item) => sum + item.points, 0);

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Sprint Planning"
        description="Plan your upcoming sprint with capacity management"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Sprint Planning" },
        ]}
        primaryAction={{
          label: "Generate Sprint",
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "Save Draft",
            onClick: () => {},
          },
        ]}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sprint Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Sprint Name"
                  value={sprintName}
                  onChange={(e) => setSprintName(e.target.value)}
                />
                <Select
                  label="Duration"
                  options={[
                    { value: "1", label: "1 Week" },
                    { value: "2", label: "2 Weeks" },
                    { value: "3", label: "3 Weeks" },
                    { value: "4", label: "4 Weeks" },
                  ]}
                  defaultValue="2"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  defaultValue="2025-07-29"
                />
                <Input
                  label="End Date"
                  type="date"
                  defaultValue="2025-08-12"
                />
              </div>
              <Input
                label="Sprint Goal"
                placeholder="What is the main objective of this sprint?"
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Available Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Available Requirements</CardTitle>
              <CardDescription>
                Requirements ready to be assigned to this sprint
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {availableRequirements.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          {req.id}
                        </span>
                        <Badge variant="outline" size="sm">
                          {req.recommendedSprint}
                        </Badge>
                      </div>
                      <p className="font-medium text-slate-900 mt-1">
                        {req.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Dependencies: {req.dependencies}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" size="sm">
                        {req.points} pts
                      </Badge>
                      <Button variant="secondary" size="sm">
                        Add
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sprint Allocation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Allocation</CardTitle>
              <CardDescription>
                Requirements assigned to this sprint
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {sprintAllocation.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <span className="font-mono text-xs text-slate-400">
                        {req.id}
                      </span>
                      <p className="font-medium text-slate-900">{req.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" size="sm">
                        {req.points} pts
                      </Badge>
                      <Button variant="ghost" size="sm">
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Capacity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Capacity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-lg font-bold text-slate-900">
                    {capacity.total}
                  </p>
                  <p className="text-xs text-slate-500">Capacity</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-lg font-bold text-blue-600">
                    {totalAllocated}
                  </p>
                  <p className="text-xs text-slate-500">Allocated</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <p className="text-lg font-bold text-emerald-600">
                    {capacity.total - totalAllocated}
                  </p>
                  <p className="text-xs text-slate-500">Remaining</p>
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(totalAllocated / capacity.total) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Sprint</span>
                <span className="font-medium text-slate-900">{sprintName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Requirements</span>
                <span className="font-medium text-slate-900">
                  {sprintAllocation.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Story Points</span>
                <span className="font-medium text-slate-900">
                  {totalAllocated}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Estimated Completion</span>
                <span className="font-medium text-slate-900">14 Days</span>
              </div>
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <Button className="w-full">Generate Sprint</Button>
                <Button variant="secondary" className="w-full">
                  Save Draft
                </Button>
                <Button variant="ghost" className="w-full">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Team */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team</CardTitle>
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
              </div>
              <p className="text-sm text-slate-500 mt-3">8 team members</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
