"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Sparkles,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit3,
  Lightbulb,
  TrendingUp,
  Clock,
  Target,
} from "lucide-react";
import {
  buildQuery,
  normalizeAiRecommendation,
  shortId,
  useCollection,
  useStatusCounts,
  type AiRecommendationItem,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatConfidence(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

function formatApprovedDate(value: string | null): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

export default function AIRecommendationsPage() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const pendingQuery = React.useMemo(
    () => buildQuery({ status: "pending", page: 1, pageSize: PAGE_SIZE }),
    [],
  );
  const approvedQuery = React.useMemo(
    () => buildQuery({ status: "approved", page: 1, pageSize: PAGE_SIZE }),
    [],
  );

  const {
    items: recommendations,
    error: pendingError,
    isLoading: pendingLoading,
    retry: retryPending,
  } = useCollection<AiRecommendationItem>(
    "/api/ai-recommendations",
    normalizeAiRecommendation,
    pendingQuery,
  );
  const {
    items: approvedRecommendations,
    error: approvedError,
    isLoading: approvedLoading,
    retry: retryApproved,
  } = useCollection<AiRecommendationItem>(
    "/api/ai-recommendations",
    normalizeAiRecommendation,
    approvedQuery,
  );
  const { counts } = useStatusCounts("/api/ai-recommendations", [
    "pending",
    "approved",
    "rejected",
  ]);

  // Stat cards are backend lifecycle totals; the stat icons stay in the UI layer.
  const stats = [
    { label: "Requirements Analysed", value: counts.total, icon: Target },
    { label: "Pending Review", value: counts.byStatus["pending"] ?? 0, icon: TrendingUp, color: "rose" },
    { label: "Approved", value: counts.byStatus["approved"] ?? 0, icon: Clock, color: "amber" },
    { label: "Rejected", value: counts.byStatus["rejected"] ?? 0, icon: Clock, color: "emerald" },
  ];

  const selectedRecommendation =
    recommendations.find((rec) => rec.id === selectedId) ??
    recommendations[0] ??
    null;

  const isLoading = pendingLoading && recommendations.length === 0;
  const error = pendingError;
  const hasAnalysis = counts.total > 0 || recommendations.length > 0;

  const retry = React.useCallback(() => {
    retryPending();
    retryApproved();
  }, [retryPending, retryApproved]);

  if (!isLoading && error === null && !hasAnalysis) {
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
            label: "Refresh",
            onClick: retry,
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
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => {},
          },
          {
            label: "Settings",
            onClick: () => {},
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
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    stat.color === "rose"
                      ? "bg-rose-100"
                      : stat.color === "amber"
                      ? "bg-amber-100"
                      : stat.color === "emerald"
                      ? "bg-emerald-100"
                      : "bg-slate-100"
                  }`}
                >
                  <stat.icon
                    className={`h-5 w-5 ${
                      stat.color === "rose"
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

      {isLoading ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-4 space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : error !== null && recommendations.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load recommendations"
              description={error.message}
              action={{ label: "Try again", onClick: retry }}
            />
          </CardContent>
        </Card>
      ) : (
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Side - Recommendations List */}
        <div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Requirements Ready for Review</CardTitle>
              <Badge variant="secondary" size="sm">
                {counts.byStatus["pending"] ?? recommendations.length} pending
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {recommendations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No pending recommendations. Approved and rejected items are listed below.
                </p>
              ) : (
              <div className="divide-y divide-slate-100">
                {recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedId(rec.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${
                      selectedRecommendation?.id === rec.id
                        ? "bg-slate-50 border-l-4 border-slate-900"
                        : "border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-xs text-slate-400">
                        {rec.requirement.displayId}
                      </span>
                      <Badge variant="outline" size="sm">
                        {rec.requirement.status || rec.recommendationStatus}
                      </Badge>
                    </div>
                    <p className="font-medium text-slate-900 mb-2 line-clamp-2">
                      {rec.requirement.title}
                    </p>
                    <div className="flex items-center gap-3">
                      {rec.suggestedPriority ? (
                        <PriorityChip priority={rec.suggestedPriority} size="sm" />
                      ) : null}
                      <span className="text-xs text-slate-500">
                        {rec.suggestedSprintId
                          ? shortId(rec.suggestedSprintId)
                          : "Unassigned sprint"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatConfidence(rec.confidenceScore)} confidence
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </CardContent>
          </Card>

          {/* Approved Recommendations */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Approved Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {approvedLoading && approvedRecommendations.length === 0 ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : approvedError !== null && approvedRecommendations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  Couldn&apos;t load approved recommendations.{" "}
                  <button
                    className="underline"
                    onClick={retryApproved}
                  >
                    Try again
                  </button>
                </p>
              ) : approvedRecommendations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No approved recommendations yet.
                </p>
              ) : (
              <div className="divide-y divide-slate-100">
                {approvedRecommendations.map((rec) => (
                  <div key={rec.id} className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-mono text-xs text-slate-400">
                        {rec.requirement.displayId}
                      </span>
                      <Badge variant="success" size="sm">
                        Approved
                      </Badge>
                    </div>
                    <p className="font-medium text-slate-900 mb-2">
                      {rec.requirement.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {rec.suggestedPriority ? (
                        <PriorityChip priority={rec.suggestedPriority} size="sm" />
                      ) : null}
                      <span>
                        {rec.suggestedSprintId
                          ? shortId(rec.suggestedSprintId)
                          : "Unassigned sprint"}
                      </span>
                      <span>
                        Approved {formatApprovedDate(rec.approvedAt)}
                        {rec.approvedBy ? ` · ${shortId(rec.approvedBy)}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              )}
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
                      {selectedRecommendation.requirement.displayId}
                    </span>
                    <CardTitle className="text-lg mt-1">
                      {selectedRecommendation.requirement.title}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" size="sm">
                    {selectedRecommendation.requirement.status ||
                      selectedRecommendation.recommendationStatus}
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
                        Suggested Priority
                      </span>
                      {selectedRecommendation.suggestedPriority ? (
                        <PriorityChip
                          priority={selectedRecommendation.suggestedPriority}
                        />
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Suggested Sprint
                      </span>
                      <span className="text-sm font-medium text-slate-900">
                        {selectedRecommendation.suggestedSprintId
                          ? shortId(selectedRecommendation.suggestedSprintId)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Confidence Score
                      </span>
                      <span className="text-sm font-medium text-slate-900">
                        {formatConfidence(selectedRecommendation.confidenceScore)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    Summary
                  </h4>
                  <p className="text-sm text-slate-600">
                    {selectedRecommendation.summary ?? "No summary provided."}
                  </p>
                </div>

                {/* Reasoning */}
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    Reasoning
                  </h4>
                  {selectedRecommendation.reasoning.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No reasoning provided.
                    </p>
                  ) : (
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
                  )}
                </div>

                {/* Manager Decision */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-medium text-slate-900 mb-3">
                    Manager Decision
                  </h4>
                  {/* No accept/modify/reject endpoint exists yet (Step 10 AI
                      work has not started): the actions stay disabled rather
                      than faking a decision. */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<CheckCircle className="h-4 w-4" />}
                      disabled
                      title="Accept is unavailable: no decision endpoint exists yet"
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<Edit3 className="h-4 w-4" />}
                      disabled
                      title="Modify is unavailable: no decision endpoint exists yet"
                    >
                      Modify
                    </Button>
                    <Button
                      variant="secondary"
                      className="justify-center"
                      leftIcon={<XCircle className="h-4 w-4" />}
                      disabled
                      title="Reject is unavailable: no decision endpoint exists yet"
                    >
                      Reject
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Decision actions need a backend endpoint that does not
                    exist yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}
    </AuthenticatedLayout>
  );
}
