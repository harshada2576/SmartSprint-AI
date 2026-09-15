"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
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
  FolderKanban,
  Calendar,
  Users,
  ArrowUpDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  buildQuery,
  normalizeProject,
  useCollection,
  useDebouncedValue,
  useStatusCounts,
  type ProjectItem,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

// Filter tabs mirror the backend project statuses (see parseProjectsQuery).
const FILTERS = [
  { label: "All Projects", value: "all" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Blocked", value: "blocked" },
];

function priorityBadgeVariant(priority: string): "danger" | "warning" | "success" | "default" {
  switch (priority) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "success";
    default:
      return "default";
  }
}

function formatEndDate(value: string | null): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatDate(value);
}

export default function ProjectsPage() {
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

  const { items: projects, pagination, error, isLoading, retry } =
    useCollection<ProjectItem>("/api/projects", normalizeProject, query);
  const { counts } = useStatusCounts("/api/projects", [
    "active",
    "pending",
    "completed",
    "blocked",
  ]);

  const countFor = (value: string): number | undefined => {
    // Counts come from the backend (pagination totals); no hardcoded numbers.
    if (value === "all") return counts.total;
    return counts.byStatus[value];
  };

  const showLoading = isLoading && projects.length === 0;

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Projects"
        description="Manage all your software projects"
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Projects" }]}
        primaryAction={{
          label: "Create Project",
          onClick: () => router.push("/projects/create"),
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setActiveFilter(filter.value);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <SearchInput
          placeholder="Search projects by name, client, or code..."
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
          <Button variant="secondary" leftIcon={<ArrowUpDown className="h-4 w-4" />}>
            Sort
          </Button>
          <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />}>
            Export
          </Button>
        </div>
      </div>

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          {showLoading ? (
            <div className="p-6">
              <SkeletonTable rows={6} />
            </div>
          ) : error !== null && projects.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load projects"
                description={error.message}
                action={{ label: "Try again", onClick: retry }}
              />
            </div>
          ) : projects.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FolderKanban}
                title="No projects found"
                description={
                  searchQuery.trim() !== "" || activeFilter !== "all"
                    ? "No projects match the current filters. Try a different search or filter."
                    : "Projects in your organization will show up here."
                }
                action={{
                  label: "Create Project",
                  onClick: () => router.push("/projects/create"),
                }}
              />
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Team</TableHead>
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
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">
                        {project.name}
                      </p>
                      {project.code ? (
                        <p className="text-xs text-slate-500">{project.code}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{project.client ?? "—"}</TableCell>
                  {/* The projects API returns a manager id only; names need a
                      users endpoint (see integration report). */}
                  <TableCell>
                    {project.managerId ? `ID ${project.managerId.slice(0, 8)}` : "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={project.status} size="sm" />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={priorityBadgeVariant(project.priority)}
                      size="sm"
                    >
                      {project.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 w-28">
                      <Progress value={project.progress} size="sm" />
                      <span className="text-xs text-slate-500 w-8">
                        {project.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {/* Team size is not exposed by GET /api/projects. */}
                      <span className="text-sm">—</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm">{formatEndDate(project.endDate)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
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

      {/* Pagination (backend-driven; hidden while loading or when empty) */}
      {!showLoading && error === null && pagination.total > 0 ? (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{" "}
            {pagination.total} project{pagination.total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
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
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </AuthenticatedLayout>
  );
}
