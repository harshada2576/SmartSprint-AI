"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Progress } from "@/components/ui/Progress";
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  FileCode,
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Target,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  ChevronRight,
} from "lucide-react";

const reportCategories = [
  { id: "executive", label: "Executive Summary", icon: FileText },
  { id: "project", label: "Project Report", icon: BarChart3 },
  { id: "requirements", label: "Requirements Report", icon: CheckCircle },
  { id: "sprint", label: "Sprint Report", icon: Target },
  { id: "budget", label: "Budget Report", icon: DollarSign },
  { id: "timeline", label: "Timeline Report", icon: Clock },
  { id: "contribution", label: "Contribution Report", icon: Users },
  { id: "ai", label: "AI Recommendations", icon: Lightbulb },
  { id: "variance", label: "Expected vs Actual", icon: TrendingUp },
];

const sprintReport = {
  sprint: "Sprint 4",
  goal: "Complete payment integration and checkout flow",
  duration: "Jul 14 - Jul 28, 2025",
  completion: 72,
  velocity: 32,
  totalPoints: 56,
  completedPoints: 40,
  pendingPoints: 10,
  carryForward: 6,
  blocked: 0,
};

const teamContributions = [
  { member: "John Smith", assigned: 8, completed: 6, points: 24, hours: 78, contribution: 28 },
  { member: "Sarah Chen", assigned: 6, completed: 5, points: 18, hours: 72, contribution: 22 },
  { member: "Mike Johnson", assigned: 10, completed: 7, points: 26, hours: 85, contribution: 25 },
  { member: "Emily Davis", assigned: 7, completed: 4, points: 16, hours: 64, contribution: 15 },
  { member: "David Wilson", assigned: 5, completed: 4, points: 12, hours: 48, contribution: 10 },
];

const budgetReport = {
  totalBudget: 200000,
  spent: 145000,
  remaining: 55000,
  variance: 5,
  categories: [
    { name: "Development", budget: 120000, spent: 95000 },
    { name: "Design", budget: 30000, spent: 25000 },
    { name: "Testing", budget: 25000, spent: 15000 },
    { name: "Infrastructure", budget: 25000, spent: 10000 },
  ],
};

export default function ReportsPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = React.useState("sprint");

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Reports Center"
        description="Generate and export professional reports"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Reports" },
        ]}
      />

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar - Report Categories */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {reportCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                      selectedCategory === category.id
                        ? "bg-slate-50 text-slate-900 font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <category.icon className="h-4 w-4" />
                    {category.label}
                    {selectedCategory === category.id && (
                      <ChevronRight className="h-4 w-4 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Report Preview */}
        <div className="lg:col-span-3 space-y-6">
          {/* Report Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {reportCategories.find((c) => c.id === selectedCategory)?.label}
              </h2>
              <p className="text-slate-500 mt-1">
                Generated on {new Date().toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" leftIcon={<FileText className="h-4 w-4" />}>
                PDF
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
                Excel
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<FileCode className="h-4 w-4" />}>
                CSV
              </Button>
            </div>
          </div>

          {selectedCategory === "sprint" && (
            <>
              {/* Sprint Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Sprint Summary</CardTitle>
                  <CardDescription>
                    {sprintReport.sprint} • {sprintReport.duration}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Completion</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {sprintReport.completion}%
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Velocity</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {sprintReport.velocity}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Completed</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {sprintReport.completedPoints}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Pending</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {sprintReport.pendingPoints}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team Contribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Contribution</CardTitle>
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
                          Completed
                        </th>
                        <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                          Story Points
                        </th>
                        <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                          Hours
                        </th>
                        <th className="h-10 px-4 text-center text-xs font-medium text-slate-500 uppercase">
                          Contribution
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamContributions.map((member) => (
                        <tr key={member.member}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {member.member}
                          </td>
                          <td className="px-4 py-3 text-center">{member.assigned}</td>
                          <td className="px-4 py-3 text-center text-emerald-600">
                            {member.completed}
                          </td>
                          <td className="px-4 py-3 text-center">{member.points}</td>
                          <td className="px-4 py-3 text-center">{member.hours}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-slate-900 rounded-full"
                                  style={{ width: `${member.contribution}%` }}
                                />
                              </div>
                              <span className="text-sm text-slate-600">
                                {member.contribution}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Sprint Review */}
              <Card>
                <CardHeader>
                  <CardTitle>Sprint Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-2">
                      Achievements
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                      <li>Successfully integrated payment gateway</li>
                      <li>Completed user authentication system</li>
                      <li>Achieved 72% sprint completion rate</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 mb-2">
                      Issues
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                      <li>Payment API rate limiting caused delays</li>
                      <li>3 tasks carried forward to next sprint</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h4 className="text-sm font-medium text-slate-900 mb-2">
                      Recommendations
                    </h4>
                    <p className="text-sm text-slate-600">
                      Consider increasing sprint capacity for Sprint 5 based on
                      improved velocity. Focus on completing carried-forward
                      tasks before starting new ones.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {selectedCategory === "budget" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Budget Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Total Budget</p>
                      <p className="text-2xl font-bold text-slate-900">
                        ${budgetReport.totalBudget.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Spent</p>
                      <p className="text-2xl font-bold text-amber-600">
                        ${budgetReport.spent.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Remaining</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        ${budgetReport.remaining.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 uppercase">Variance</p>
                      <p className="text-2xl font-bold text-slate-900">
                        +{budgetReport.variance}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Categories</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="border-b border-slate-200 bg-slate-50/50">
                      <tr>
                        <th className="h-10 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                          Category
                        </th>
                        <th className="h-10 px-4 text-right text-xs font-medium text-slate-500 uppercase">
                          Budget
                        </th>
                        <th className="h-10 px-4 text-right text-xs font-medium text-slate-500 uppercase">
                          Spent
                        </th>
                        <th className="h-10 px-4 text-right text-xs font-medium text-slate-500 uppercase">
                          Variance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {budgetReport.categories.map((cat) => (
                        <tr key={cat.name}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {cat.name}
                          </td>
                          <td className="px-4 py-3 text-right">
                            ${cat.budget.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            ${cat.spent.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                cat.spent > cat.budget
                                  ? "text-rose-600"
                                  : "text-emerald-600"
                              }
                            >
                              {((cat.spent / cat.budget - 1) * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}

          {selectedCategory !== "sprint" && selectedCategory !== "budget" && (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  Report Preview
                </h3>
                <p className="text-slate-500 max-w-md mx-auto">
                  Select a report category to view detailed insights and export
                  options.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
