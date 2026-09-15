"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusChip } from "@/components/ui/StatusChip";
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
  ListTodo,
  Filter,
  Download,
  MoreHorizontal,
  ArrowUpDown,
  Calendar,
  Flag,
  AlertCircle,
} from "lucide-react";
import {
  buildQuery,
  normalizeBacklogItem,
  shortId,
  useCollection,
  useDebouncedValue,
  type BacklogItem,
} from "@/lib/api-client";

const PAGE_SIZE = 20;

function ownerInitials(assigneeId: string | null): string {
  if (!assigneeId) return "–";
  return assigneeId.slice(0, 2).toUpperCase();
}

export default function BacklogPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const query = React.useMemo(
    () =>
      buildQuery({
        search: debouncedSearch.trim() === "" ? undefined : debouncedSearch.trim(),
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, page],
  );

  const { items, pagination, error, isLoading, retry } =
    useCollection<BacklogItem>("/api/backlog", normalizeBacklogItem, query);

  const showLoading = isLoading && items.length === 0;

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Product Backlog"
        description="Manage everything approved for development"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Product Backlog" },
        ]}
        primaryAction={{
          label: "Add Item",
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "Export",
            onClick: () => {},
          },
        ]}
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <SearchInput
          placeholder="Search backlog items..."
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

      {/* Backlog Table */}
      <Card>
        <CardContent className="p-0">
          {showLoading ? (
            <div className="p-6">
              <SkeletonTable rows={8} />
            </div>
          ) : error !== null && items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load the backlog"
                description={error.message}
                action={{ label: "Try again", onClick: retry }}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ListTodo}
                title="Backlog is empty"
                description={
                  searchQuery.trim() !== ""
                    ? "No backlog items match your search. Try a different search."
                    : "Approved requirements will show up here, ordered by rank."
                }
              />
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Story Points</TableHead>
                <TableHead>Sprint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/requirements/${item.requirement.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {item.rank}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-mono text-xs text-slate-400">
                        {item.requirement.displayId}
                      </span>
                      <p className="font-medium text-slate-900">{item.requirement.title}</p>
                      <Badge variant="outline" size="sm" className="mt-1">
                        {item.requirement.category || "—"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {item.requirement.storyPoints ?? "—"}
                      {item.requirement.storyPoints !== null ? " pts" : ""}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.requirement.sprintId ? (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm">
                          {shortId(item.requirement.sprintId)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={item.requirement.status} size="sm" />
                  </TableCell>
                  <TableCell>
                    {/* The backlog API returns an assignee id only; names need
                        a users endpoint (see integration report). */}
                    {item.requirement.assigneeId ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {ownerInitials(item.requirement.assigneeId)}
                        </div>
                        <span className="text-sm">
                          {shortId(item.requirement.assigneeId)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-sm">Unassigned</span>
                    )}
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
            {pagination.total} item{pagination.total === 1 ? "" : "s"}
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
    </AuthenticatedLayout>
  );
}
