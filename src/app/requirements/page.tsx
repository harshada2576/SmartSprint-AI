"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Filter,
  Download,
  MoreHorizontal,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  buildQuery,
  normalizeRequirement,
  shortId,
  useCollection,
  useDebouncedValue,
  useStatusCounts,
  type RequirementItem,
} from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 20;

// Filter tabs use the backend requirement statuses (see parseRequirementsQuery).
// "completed" replaces the old mock-only "approved" value, which the API rejects.
const FILTERS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "inProgress" },
  { label: "Review", value: "review" },
  { label: "Testing", value: "testing" },
  { label: "Completed", value: "completed" },
  { label: "Blocked", value: "blocked" },
];

function businessValueVariant(value: string): "success" | "warning" | "default" {
  switch (value.toLowerCase()) {
    case "high":
      return "success";
    case "medium":
      return "warning";
    default:
      return "default";
  }
}

function formatUpdated(value: string): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

export default function RequirementsPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const query = React.useMemo(
    () =>
      buildQuery({
        status: activeFilter === "all" ? undefined : activeFilter,
        search: debouncedSearch.trim() === "" ? undefined : debouncedSearch.trim(),
        page,
        pageSize: PAGE_SIZE,
      }),
    [activeFilter, debouncedSearch, page],
  );

  const { items: requirements, pagination, error, isLoading, retry } =
    useCollection<RequirementItem>("/api/requirements", normalizeRequirement, query);
  const { counts } = useStatusCounts("/api/requirements", [
    "draft",
    "pending",
    "inProgress",
    "review",
    "testing",
    "completed",
    "blocked",
  ]);

  // Stat cards are backend totals; the stat icons stay in the UI layer.
  const stats = [
    { label: "Total Requirements", value: counts.total, icon: FileText },
    { label: "Pending Validation", value: counts.byStatus["pending"] ?? 0, icon: Clock },
    { label: "In Review", value: counts.byStatus["review"] ?? 0, icon: Sparkles },
    { label: "Completed", value: counts.byStatus["completed"] ?? 0, icon: CheckCircle },
  ];

  // "Awaiting action" is derived from real rows needing attention.
  const awaitingAction = requirements
    .filter((req) => req.status === "pending" || req.status === "review" || req.status === "draft")
    .slice(0, 3)
    .map((req) => ({
      id: req.id,
      title: `${req.displayId} needs ${req.status === "review" ? "approval" : "validation"}`,
      action: req.status === "review" ? "Review" : "Validate",
    }));

  const countFor = (value: string): number | undefined => {
    if (value === "all") return counts.total;
    return counts.byStatus[value];
  };

  const showLoading = isLoading && requirements.length === 0;

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Requirements Engineering"
        description="Manage software requirements throughout their lifecycle"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Requirements" },
        ]}
        primaryAction={{
          label: "Add Requirement",
          onClick: () => router.push("/requirements/create"),
        }}
        secondaryActions={[
          {
            label: "Import",
            onClick: () => {},
          },
          {
            label: "Export",
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
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-slate-600" />
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

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Requirements</TabsTrigger>
          <TabsTrigger value="validation">Validation Queue</TabsTrigger>
          <TabsTrigger value="traceability">Traceability</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {/* Awaiting Action */}
          {awaitingAction.length > 0 && (
            <Card className="mb-6 border-amber-200 bg-amber-50/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Requirements Awaiting Action
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {awaitingAction.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200"
                    >
                      <span className="text-sm text-slate-700">
                        {item.title}
                      </span>
                      <Button variant="secondary" size="sm">
                        {item.action}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  setActiveFilter(filter.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === filter.value
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {filter.label}
                <span
                  className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                    activeFilter === filter.value
                      ? "bg-white/20"
                      : "bg-slate-100"
                  }`}
                >
                  {countFor(filter.value) ?? "—"}
                </span>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <SearchInput
              placeholder="Search requirements..."
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setPage(1);
              }}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button variant="secondary" leftIcon={<Filter className="h-4 w-4" />}>
                Filter
              </Button>
              <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />}>
                Export
              </Button>
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {showLoading ? (
                <div className="p-6">
                  <SkeletonTable rows={6} />
                </div>
              ) : error !== null && requirements.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={AlertCircle}
                    title="Couldn't load requirements"
                    description={error.message}
                    action={{ label: "Try again", onClick: retry }}
                  />
                </div>
              ) : requirements.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={FileText}
                    title="No requirements found"
                    description={
                      searchQuery.trim() !== "" || activeFilter !== "all"
                        ? "No requirements match the current filters. Try a different search or filter."
                        : "Requirements in your projects will show up here."
                    }
                    action={{
                      label: "Add Requirement",
                      onClick: () => router.push("/requirements/create"),
                    }}
                  />
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Business Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.map((req) => (
                    <TableRow
                      key={req.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/requirements/${req.id}`)}
                    >
                      <TableCell className="font-mono text-xs text-slate-500">
                        {req.displayId}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 max-w-xs truncate">
                        {req.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm">
                          {req.category || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={businessValueVariant(req.businessValue)}
                          size="sm"
                        >
                          {req.businessValue || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={req.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <PriorityChip priority={req.priority} size="sm" />
                      </TableCell>
                      <TableCell>
                        {req.sprintId ? shortId(req.sprintId) : "—"}
                      </TableCell>
                      <TableCell>
                        {req.assigneeId ? shortId(req.assigneeId) : "Unassigned"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>

          {!showLoading && error === null && pagination.total > 0 ? (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{" "}
                {pagination.total} requirement{pagination.total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      pagination.totalPages > 0
                        ? Math.min(current + 1, pagination.totalPages)
                        : current + 1,
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="validation" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Validation Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500">
                Requirements awaiting validation before AI analysis.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traceability" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Requirement Traceability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500">
                Track relationships between requirements and project artifacts.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Requirement Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500">
                Manage requirement categories and types.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
