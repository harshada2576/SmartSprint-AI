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
  Target,
  X,
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

type CommitmentOption = {
  id: string;
  title: string;
  status: string;
};

function ownerInitials(assigneeId: string | null): string {
  if (!assigneeId) return "–";
  return assigneeId.slice(0, 2).toUpperCase();
}

export default function BacklogPage() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] =
    React.useState("");

  const [page, setPage] = React.useState(1);

  const [commitmentsByProject, setCommitmentsByProject] =
    React.useState<Record<string, CommitmentOption[]>>(
      {},
    );

  const [loadingCommitments, setLoadingCommitments] =
    React.useState<Record<string, boolean>>({});

  const [isAddModalOpen, setIsAddModalOpen] =
    React.useState(false);
  const [projects, setProjects] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [requirementsForProject, setRequirementsForProject] =
    React.useState<
      {
        id: string;
        displayId: string;
        title: string;
        projectId: string;
      }[]
    >([]);
  const [addProjectId, setAddProjectId] = React.useState("");
  const [addRequirementId, setAddRequirementId] =
    React.useState("");
  const [addCommitmentId, setAddCommitmentId] =
    React.useState("");
  const [addCommitments, setAddCommitments] = React.useState<
    CommitmentOption[]
  >([]);
  const [isAddLoading, setIsAddLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(
    null,
  );

  const debouncedSearch =
    useDebouncedValue(searchQuery, 300);

  const query = React.useMemo(
    () =>
      buildQuery({
        search:
          debouncedSearch.trim() === ""
            ? undefined
            : debouncedSearch.trim(),
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, page],
  );

  const {
    items,
    pagination,
    error,
    isLoading,
    retry,
  } = useCollection<BacklogItem>(
    "/api/backlog",
    normalizeBacklogItem,
    query,
  );

  const showLoading =
    isLoading && items.length === 0;

  async function loadCommitments(projectId: string) {
    if (commitmentsByProject[projectId]) {
      return;
    }

    setLoadingCommitments((current) => ({
      ...current,
      [projectId]: true,
    }));

    try {
      const response = await fetch(
        `/api/commitments?projectId=${encodeURIComponent(
          projectId,
        )}`,
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load commitments.",
        );
      }

      const result = await response.json();

      const rawItems = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
          ? result.data
          : [];

      const commitments: CommitmentOption[] =
        rawItems.map(
          (item: {
            id: string;
            title: string;
            status: string;
          }) => ({
            id: item.id,
            title: item.title,
            status: item.status,
          }),
        );

      setCommitmentsByProject((current) => ({
        ...current,
        [projectId]: commitments,
      }));
    } catch (loadError) {
      console.error(
        "Failed to load commitments:",
        loadError,
      );
    } finally {
      setLoadingCommitments((current) => ({
        ...current,
        [projectId]: false,
      }));
    }
  }

  async function openAddBacklogModal() {
    setIsAddModalOpen(true);
    setAddError(null);

    if (projects.length > 0) {
      return;
    }

    setIsAddLoading(true);

    try {
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error("Failed to load projects.");
      }

      const result = await response.json();
      const rawProjects = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
          ? result.data
          : Array.isArray(result?.items)
            ? result.items
            : [];

      const nextProjects = rawProjects
        .map(
          (project: {
            id?: string;
            name?: string;
            title?: string;
          }) => ({
            id: project.id ?? "",
            name: project.name ?? project.title ?? "Unnamed project",
          }),
        )
        .filter((project: { id: string; name: string }) => project.id);

      setProjects(nextProjects);
    } catch (loadError) {
      setAddError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load projects.",
      );
    } finally {
      setIsAddLoading(false);
    }
  }

  async function loadAddFormData(projectId: string) {
    setAddProjectId(projectId);
    setAddRequirementId("");
    setAddCommitmentId("");
    setRequirementsForProject([]);
    setAddCommitments([]);
    setAddError(null);

    if (!projectId) {
      return;
    }

    setIsAddLoading(true);

    try {
      const [requirementsResponse, commitmentsResponse] =
        await Promise.all([
          fetch(
            `/api/requirements?projectId=${encodeURIComponent(
              projectId,
            )}&page=1&pageSize=100`,
          ),
          fetch(
            `/api/commitments?projectId=${encodeURIComponent(
              projectId,
            )}`,
          ),
        ]);

      if (!requirementsResponse.ok) {
        throw new Error("Failed to load requirements.");
      }

      if (!commitmentsResponse.ok) {
        throw new Error("Failed to load commitments.");
      }

      const requirementsResult = await requirementsResponse.json();
      const commitmentsResult = await commitmentsResponse.json();

      const rawRequirements = Array.isArray(requirementsResult)
        ? requirementsResult
        : Array.isArray(requirementsResult?.data)
          ? requirementsResult.data
          : Array.isArray(requirementsResult?.items)
            ? requirementsResult.items
            : [];

      const nextRequirements = rawRequirements
        .map(
          (requirement: {
            id?: string;
            display_id?: string;
            displayId?: string;
            title?: string;
            project_id?: string;
            projectId?: string;
          }) => ({
            id: requirement.id ?? "",
            displayId:
              requirement.display_id ??
              requirement.displayId ??
              requirement.id ??
              "",
            title: requirement.title ?? "Untitled requirement",
            projectId:
              requirement.project_id ??
              requirement.projectId ??
              projectId,
          }),
        )
        .filter(
          (requirement: {
            id: string;
            displayId: string;
            title: string;
            projectId: string;
          }) =>
            requirement.id &&
            requirement.projectId === projectId,
        );

      const rawCommitments = Array.isArray(commitmentsResult)
        ? commitmentsResult
        : Array.isArray(commitmentsResult?.data)
          ? commitmentsResult.data
          : [];

      const nextCommitments: CommitmentOption[] =
        rawCommitments.map(
          (item: {
            id: string;
            title: string;
            status: string;
          }) => ({
            id: item.id,
            title: item.title,
            status: item.status,
          }),
        );

      setRequirementsForProject(nextRequirements);
      setAddCommitments(nextCommitments);
    } catch (loadError) {
      setAddError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load backlog form data.",
      );
    } finally {
      setIsAddLoading(false);
    }
  }

  async function addBacklogItem() {
    if (!addProjectId || !addRequirementId) {
      setAddError("Please select a project and requirement.");
      return;
    }

    setIsSaving(true);
    setAddError(null);

    try {
      const response = await fetch("/api/backlog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: addProjectId,
          requirementId: addRequirementId,
          commitmentId: addCommitmentId || null,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error?.message ??
            result?.error ??
            "Failed to add backlog item.",
        );
      }

      setIsAddModalOpen(false);
      setAddProjectId("");
      setAddRequirementId("");
      setAddCommitmentId("");
      setRequirementsForProject([]);
      setAddCommitments([]);
      retry();
    } catch (saveError) {
      setAddError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to add backlog item.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateCommitment(
    backlogId: string,
    projectId: string,
    commitmentId: string | null,
  ) {
    try {
      const response = await fetch("/api/backlog", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backlogId,
          commitmentId,
        }),
      });

      if (!response.ok) {
        const result = await response
          .json()
          .catch(() => null);

        throw new Error(
          result?.error?.message ??
            "Failed to update commitment.",
        );
      }

      // Refresh the backlog so the new relationship
      // is immediately reflected in the table.
      retry();

      // Make sure the commitment list for this project
      // remains available for future changes.
      await loadCommitments(projectId);
    } catch (updateError) {
      console.error(
        "Failed to update backlog commitment:",
        updateError,
      );

      window.alert(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update commitment.",
      );
    }
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Product Backlog"
        description="Manage everything approved for development"
        breadcrumb={[
          {
            label: "Dashboard",
            href: "/dashboard",
          },
          {
            label: "Product Backlog",
          },
        ]}
        primaryAction={{
          label: "Add Item",
          onClick: openAddBacklogModal,
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
          <Button
            variant="secondary"
            leftIcon={
              <Filter className="h-4 w-4" />
            }
          >
            Filter
          </Button>

          <Button
            variant="secondary"
            leftIcon={
              <ArrowUpDown className="h-4 w-4" />
            }
          >
            Sort
          </Button>

          <Button
            variant="secondary"
            leftIcon={
              <Download className="h-4 w-4" />
            }
          >
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
          ) : error !== null &&
            items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load the backlog"
                description={error.message}
                action={{
                  label: "Try again",
                  onClick: retry,
                }}
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
                  <TableHead className="w-16">
                    Priority
                  </TableHead>

                  <TableHead>
                    Requirement
                  </TableHead>

                  <TableHead>
                    Commitment
                  </TableHead>

                  <TableHead>
                    Story Points
                  </TableHead>

                  <TableHead>
                    Sprint
                  </TableHead>

                  <TableHead>
                    Status
                  </TableHead>

                  <TableHead>
                    Owner
                  </TableHead>

                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {items.map((item) => {
                  const projectCommitments =
                    commitmentsByProject[
                      item.projectId
                    ] ?? [];

                  const commitmentsLoading =
                    loadingCommitments[
                      item.projectId
                    ] ?? false;

                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(
                          `/requirements/${item.requirement.id}`,
                        )
                      }
                    >
                      {/* Priority / Rank */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Flag className="h-4 w-4 text-slate-400" />

                          <span className="font-medium text-slate-900">
                            {item.rank}
                          </span>
                        </div>
                      </TableCell>

                      {/* Requirement */}
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs text-slate-400">
                            {item.requirement.displayId}
                          </span>

                          <p className="font-medium text-slate-900">
                            {item.requirement.title}
                          </p>

                          <Badge
                            variant="outline"
                            size="sm"
                            className="mt-1"
                          >
                            {item.requirement.category ||
                              "—"}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Commitment */}
                      <TableCell
                        onClick={(event) =>
                          event.stopPropagation()
                        }
                      >
                        <div className="min-w-[190px]">
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="h-3.5 w-3.5 text-slate-500" />

                            <span className="text-xs font-medium text-slate-500">
                              Link commitment
                            </span>
                          </div>

                          <select
                            value={
                              item.commitmentId ?? ""
                            }
                            disabled={
                              commitmentsLoading
                            }
                            onFocus={() =>
                              loadCommitments(
                                item.projectId,
                              )
                            }
                            onChange={(event) => {
                              const value =
                                event.target.value;

                              updateCommitment(
                                item.id,
                                item.projectId,
                                value === ""
                                  ? null
                                  : value,
                              );
                            }}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="">
                              {commitmentsLoading
                                ? "Loading..."
                                : "Not linked"}
                            </option>

                            {projectCommitments.map(
                              (commitment) => (
                                <option
                                  key={
                                    commitment.id
                                  }
                                  value={
                                    commitment.id
                                  }
                                >
                                  {commitment.title}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </TableCell>

                      {/* Story Points */}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          size="sm"
                        >
                          {item.requirement
                            .storyPoints ??
                            "—"}

                          {item.requirement
                            .storyPoints !== null
                            ? " pts"
                            : ""}
                        </Badge>
                      </TableCell>

                      {/* Sprint */}
                      <TableCell>
                        {item.requirement.sprintId ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />

                            <span className="text-sm">
                              {shortId(
                                item.requirement
                                  .sprintId,
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">
                            Unassigned
                          </span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusChip
                          status={
                            item.requirement.status
                          }
                          size="sm"
                        />
                      </TableCell>

                      {/* Owner */}
                      <TableCell>
                        {item.requirement.assigneeId ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                              {ownerInitials(
                                item.requirement
                                  .assigneeId,
                              )}
                            </div>

                            <span className="text-sm">
                              {shortId(
                                item.requirement
                                  .assigneeId,
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">
                            Unassigned
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell
                        onClick={(event) =>
                          event.stopPropagation()
                        }
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAddModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Add Backlog Item
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add an existing requirement to the product backlog.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (!isSaving) {
                    setIsAddModalOpen(false);
                    setAddError(null);
                  }
                }}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {addError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {addError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Project <span className="text-red-500">*</span>
                </label>
                <select
                  value={addProjectId}
                  disabled={isAddLoading || isSaving}
                  onChange={(event) =>
                    loadAddFormData(event.target.value)
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
                >
                  <option value="">
                    {isAddLoading
                      ? "Loading projects..."
                      : "Select a project"}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Requirement <span className="text-red-500">*</span>
                </label>
                <select
                  value={addRequirementId}
                  disabled={
                    !addProjectId ||
                    isAddLoading ||
                    isSaving
                  }
                  onChange={(event) =>
                    setAddRequirementId(event.target.value)
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
                >
                  <option value="">
                    {!addProjectId
                      ? "Select a project first"
                      : isAddLoading
                        ? "Loading requirements..."
                        : requirementsForProject.length === 0
                          ? "No requirements available"
                          : "Select a requirement"}
                  </option>
                  {requirementsForProject.map((requirement) => (
                    <option
                      key={requirement.id}
                      value={requirement.id}
                    >
                      {requirement.displayId} — {requirement.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Commitment
                </label>
                <select
                  value={addCommitmentId}
                  disabled={
                    !addProjectId ||
                    isAddLoading ||
                    isSaving
                  }
                  onChange={(event) =>
                    setAddCommitmentId(event.target.value)
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
                >
                  <option value="">
                    {addProjectId
                      ? addCommitments.length === 0
                        ? "No commitments available"
                        : "No commitment"
                      : "Select a project first"}
                  </option>
                  {addCommitments.map((commitment) => (
                    <option
                      key={commitment.id}
                      value={commitment.id}
                    >
                      {commitment.title} ({commitment.status})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-500">
                Rank is assigned automatically based on the
                current backlog.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button
                variant="secondary"
                onClick={() => {
                  if (!isSaving) {
                    setIsAddModalOpen(false);
                    setAddError(null);
                  }
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={addBacklogItem}
                disabled={
                  isSaving ||
                  isAddLoading ||
                  !addProjectId ||
                  !addRequirementId
                }
              >
                {isSaving ? "Adding..." : "Add to Backlog"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pagination */}
      {!showLoading &&
      error === null &&
      pagination.total > 0 ? (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Page {pagination.page} of{" "}
            {Math.max(
              pagination.totalPages,
              1,
            )}{" "}
            · {pagination.total} item
            {pagination.total === 1
              ? ""
              : "s"}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setPage((current) =>
                  Math.max(current - 1, 1),
                )
              }
            >
              Previous
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setPage((current) =>
                  pagination.totalPages > 0
                    ? Math.min(
                        current + 1,
                        pagination.totalPages,
                      )
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