"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Sparkles,
  RefreshCw,
  Settings,
  Download,
  CheckCircle,
  XCircle,
  Edit3,
  Lightbulb,
  TrendingUp,
  Clock,
  Target,
  ArrowRight,
  Play,
} from "lucide-react";

const stats = [
  { label: "Requirements Analysed", value: 42, icon: Target },
  { label: "High Priority", value: 12, icon: TrendingUp, color: "rose" },
  { label: "Medium Priority", value: 18, icon: Clock, color: "amber" },
  { label: "Low Priority", value: 12, icon: Clock, color: "emerald" },
];

const recommendations = [
  {
    id: "REC-001",
    requirement: "User Authentication with Multi-Factor Authentication",
    category: "Security",
    currentStatus: "pending",
    suggestedPriority: "high",
    suggestedSprint: "Sprint 1",
    confidence: 94,
    summary:
      "High business impact security feature with medium implementation effort. Critical for compliance requirements.",
    reasoning: [
      "Security requirement with regulatory compliance implications",
      "Medium complexity implementation (est. 40 hours)",
      "Blocks multiple dependent features",
      "High customer impact for data protection",
    ],
    status: "pending",
  },
  {
    id: "REC-002",
    requirement: "Payment Gateway Integration",
    category: "Feature",
    currentStatus: "review",
    suggestedPriority: "high",
    suggestedSprint: "Sprint 2",
    confidence: 91,
    summary:
      "Critical path feature directly impacting revenue. High business value with manageable technical complexity.",
    reasoning: [
      "Direct revenue impact - enables transactions",
      "Well-defined integration requirements",
      "Team has prior experience with similar integrations",
      "Required for MVP launch",
    ],
    status: "pending",
  },
  {
    id: "REC-003",
    requirement: "Customer Review and Rating System",
    category: "Feature",
    currentStatus: "draft",
    suggestedPriority: "low",
    suggestedSprint: "Sprint 5",
    confidence: 87,
    summary:
      "Valuable feature for user engagement but lower immediate business impact. Can be deferred post-MVP.",
    reasoning: [
      "Enhances user engagement but not critical for launch",
      "Lower immediate revenue impact",
      "Can be implemented incrementally",
      "Nice-to-have for post-MVP phase",
    ],
    status: "pending",
  },
  {
    id: "REC-004",
    requirement: "Advanced Analytics Dashboard",
    category: "Feature",
    currentStatus: "draft",
    suggestedPriority: "medium",
    suggestedSprint: "Sprint 4",
    confidence: 85,
    summary:
      "Medium priority feature providing valuable insights. Good balance of effort and business value.",
    reasoning: [
      "Valuable for business intelligence",
      "Medium implementation complexity",
      "Depends on core transaction features",
      "Recommended for post-launch optimization",
    ],
    status: "pending",
  },
];

const approvedRecommendations = [
  {
    id: "REC-000",
    requirement: "Product Catalog Search and Filtering",
    priority: "high",
    sprint: "Sprint 2",
    approvedDate: "2025-07-15",
    approvedBy: "John Smith",
  },
  {
    id: "REC-001",
    requirement: "Shopping Cart Persistence",
    priority: "medium",
    sprint: "Sprint 3",
    approvedDate: "2025-07-14",
    approvedBy: "Sarah Chen",
  },
];

function getPriorityBadgeVariant(priority: string) {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  if (priority === "low") return "success";
  return "default";
}

export default function AIRecommendationsPage() {
  const router = useRouter();
  const [selectedRecommendation, setSelectedRecommendation] = React.useState(
    recommendations[0]
  );
  const [hasRunAnalysis, setHasRunAnalysis] = React.useState(true);

  if (!hasRunAnalysis) {
    return (
      <AuthenticatedLayout>
        <PageHeader
          title="AI Recommendations"
          description="Review AI-generated recommendations before adding requirements to the Product Backlog"
          breadcrumb={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "AI Recommendations" },
          ]}
        />
        <EmptyState
          icon={Sparkles}
          title="No recommendations available"
          description="Run AI analysis after validating project requirements to get intelligent prioritization recommendations."
          action={{
            label: "Run Analysis",
            onClick: () => setHasRunAnalysis(true),
          }}
        />
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="AI Recommendations"
        description="Review AI-generated recommendations before adding requirements to the Product Backlog"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "AI Recommendations" },
        ]}
        primaryAction={{
          label: "Run Analysis",
          onClick: () => { },
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => { },
          },
          {
            label: "Settings",
            onClick: () => { },
          },
        ]}
      />

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color === "rose"
                      ? "bg-rose-100"
                      : stat.color === "amber"
                        ? "bg-amber-100"
                        : stat.color === "emerald"
                          ? "bg-emerald-100"
                          : "bg-slate-100"
                    }`}
                >
                  <stat.icon
                    className={`h-5 w-5 ${stat.color === "rose"
                        ? "text-rose-600"
                        : stat.color === "amber"
                          ? "text-amber-600"
                          : stat.color === "emerald"
                            ? "text-emerald-600"
                            : "text-slate-600"
                      }`}
                  />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">
                    {stat.value}
                  </p>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Side - Recommendations List */}
        <div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Requirements Ready for Review</CardTitle>
              <Badge variant="secondary" size="sm">
                {recommendations.length} pending
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedRecommendation(rec)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedRecommendation?.id === rec.id
                        ? "bg-slate-50 border-l-4 border-slate-900"
                        : "border-l-4 border-transparent"
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-xs text-slate-400">
                        {rec.id}
                      </span>
                      <Badge variant="outline" size="sm">
                        {rec.category}
                      </Badge>
                    </div>
                    <p className="font-medium text-slate-900 mb-2 line-clamp-2">
                      {rec.requirement}
                    </p>
                    <div className="flex items-center gap-3">
                      <PriorityChip priority={rec.suggestedPriority} size="sm" />
                      <Badge variant={getPriorityBadgeVariant(rec.suggestedPriority) as never} size="sm">
                        Predicted {rec.suggestedPriority.charAt(0).toUpperCase() + rec.suggestedPriority.slice(1)}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {rec.suggestedSprint}
                      </span>
                      <span className="text-xs text-slate-400">
                        {rec.confidence}% confidence
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Approved Recommendations */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Approved Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {approvedRecommendations.map((rec) => (
                  <div key={rec.id} className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-mono text-xs text-slate-400">
                        {rec.id}
                      </span>
                      <Badge variant="success" size="sm">
                        Approved
                      </Badge>
                    </div>
                    <p className="font-medium text-slate-900 mb-2">
                      {rec.requirement}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <PriorityChip priority={rec.priority} size="sm" />
                      <span>{rec.sprint}</span>
                      <span>Approved by {rec.approvedBy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side - Recommendation Detail */}
        <div>
          {selectedRecommendation && (
            <Card className="sticky top-24">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs text-slate-400">
                      {selectedRecommendation.id}
                    </span>
                    <CardTitle className="text-lg mt-1">
                      {selectedRecommendation.requirement}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" size="sm">
                    {selectedRecommendation.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Recommendation */}
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    AI Recommendation
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Predicted Priority
                      </span>
                      <Badge
                        variant={getPriorityBadgeVariant(selectedRecommendation.suggestedPriority) as never}
                      >
                        {selectedRecommendation.suggestedPriority.charAt(0).toUpperCase() +
                          selectedRecommendation.suggestedPriority.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Prediction Confidence</span>
                      <span className="text-sm font-medium text-slate-900">
                        {selectedRecommendation.confidence}%
                      </span>
                    </div>
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
                      <p className="text-sm font-medium text-slate-900 mb-1">
                        AI Explanation / SHAP rationale
                      </p>
                      <p className="text-sm text-slate-600">
                        {selectedRecommendation.summary}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <span className="text-sm text-slate-500">Suggested Sprint</span>
                  <span className="text-sm font-medium text-slate-900">
                    {selectedRecommendation.suggestedSprint}
                  </span>
                </div>

                {/* Summary */}
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    Summary
                  </h4>
                  <p className="text-sm text-slate-600">
                    {selectedRecommendation.summary}
                  </p>
                </div>

                {/* Reasoning */}
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    Reasoning
                  </h4>
                  <ul className="space-y-2">
                    {selectedRecommendation.reasoning.map((reason, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-slate-600"
                      >
                        <span className="text-slate-400 mt-1">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Manager Decision */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-medium text-slate-900 mb-3">
                    Manager Decision
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<CheckCircle className="h-4 w-4" />}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<Edit3 className="h-4 w-4" />}
                    >
                      Modify
                    </Button>
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<XCircle className="h-4 w-4" />}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
