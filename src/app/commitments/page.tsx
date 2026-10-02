"use client";

import * as React from "react";
import {
  Plus,
  Calendar,
  User,
  AlertCircle,
  Target,
  X,
} from "lucide-react";

import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type Commitment = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  commitment_type:
    | "outcome"
    | "deliverable"
    | "milestone"
    | "obligation";
  status:
    | "planned"
    | "inProgress"
    | "completed"
    | "blocked";
  due_date: string | null;
  progress: number;
  owner_id: string | null;
};

function statusLabel(status: Commitment["status"]) {
  if (status === "inProgress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "blocked") return "Blocked";
  return "Planned";
}

function typeLabel(type: Commitment["commitment_type"]) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function CommitmentsPage() {
  const [projectId, setProjectId] = React.useState("");
  const [commitments, setCommitments] = React.useState<Commitment[]>(
    [],
  );

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [showForm, setShowForm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [commitmentType, setCommitmentType] = React.useState<
    Commitment["commitment_type"]
  >("deliverable");
  const [dueDate, setDueDate] = React.useState("");
  const [progress, setProgress] = React.useState(0);

  /*
   * Read projectId from the URL.
   *
   * Example:
   * /commitments?projectId=abc-123
   */
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("projectId");

    if (urlProjectId) {
      setProjectId(urlProjectId);
    }
  }, []);

  /*
   * Load commitments.
   */
  async function loadCommitments() {
    if (!projectId.trim()) {
      setError("Project ID is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/commitments?projectId=${encodeURIComponent(
          projectId.trim(),
        )}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message ??
            result?.error ??
            "Failed to load commitments",
        );
      }

      setCommitments(result?.data ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load commitments",
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * Automatically load commitments when projectId
   * comes from the Project Details page.
   */
  React.useEffect(() => {
    if (!projectId.trim()) return;

    loadCommitments();

    // loadCommitments intentionally runs when projectId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /*
   * Reset the Add Commitment form.
   */
  function resetForm() {
    setTitle("");
    setDescription("");
    setCommitmentType("deliverable");
    setDueDate("");
    setProgress(0);
  }

  /*
   * Add a new commitment.
   */
  async function handleAddCommitment(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!projectId.trim()) {
      setError("Project ID is required.");
      return;
    }

    if (!title.trim()) {
      setError("Commitment title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/commitments", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: projectId.trim(),
          title: title.trim(),
          description: description.trim() || null,
          commitment_type: commitmentType,
          status: "planned",
          due_date: dueDate || null,
          progress,
          owner_id: null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message ??
            result?.error ??
            "Failed to create commitment",
        );
      }

      resetForm();
      setShowForm(false);

      await loadCommitments();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create commitment",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Commitments"
        description="Track project outcomes, deliverables, milestones, and obligations"
        breadcrumb={[
          {
            label: "Dashboard",
            href: "/dashboard",
          },
          {
            label: "Commitments",
          },
        ]}
      />

      <div className="space-y-6">
        {/* Project selector */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Project Commitments
              </CardTitle>

              <CardDescription>
                Load and manage commitments for a project.
              </CardDescription>
            </div>

            <Button
              size="sm"
              onClick={() => {
                setError(null);
                setShowForm((value) => !value);
              }}
              disabled={!projectId.trim()}
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Commitment
                </>
              )}
            </Button>
          </CardHeader>

          <CardContent>
            <div className="flex gap-2">
              <input
                value={projectId}
                onChange={(event) =>
                  setProjectId(event.target.value)
                }
                placeholder="Enter Project ID"
                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />

              <Button
                onClick={loadCommitments}
                disabled={
                  !projectId.trim() || loading
                }
              >
                {loading ? "Loading..." : "Load"}
              </Button>
            </div>

            {projectId && (
              <p className="mt-2 text-xs text-slate-500">
                Project ID: {projectId}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Add Commitment Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Add Commitment
              </CardTitle>

              <CardDescription>
                Create a new project commitment.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form
                onSubmit={handleAddCommitment}
                className="space-y-4"
              >
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Title
                  </label>

                  <input
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="e.g. Complete project documentation"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>

                  <textarea
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Describe the commitment..."
                    rows={3}
                    className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </div>

                {/* Type + Due Date */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Commitment Type
                    </label>

                    <select
                      value={commitmentType}
                      onChange={(event) =>
                        setCommitmentType(
                          event.target.value as Commitment["commitment_type"],
                        )
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="outcome">
                        Outcome
                      </option>

                      <option value="deliverable">
                        Deliverable
                      </option>

                      <option value="milestone">
                        Milestone
                      </option>

                      <option value="obligation">
                        Obligation
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Due Date
                    </label>

                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) =>
                        setDueDate(event.target.value)
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-slate-700">
                      Progress
                    </label>

                    <span className="text-sm text-slate-500">
                      {progress}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={progress}
                    onChange={(event) =>
                      setProgress(
                        Number(event.target.value),
                      )
                    }
                    className="w-full"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    disabled={
                      saving || !title.trim()
                    }
                  >
                    {saving
                      ? "Saving..."
                      : "Create Commitment"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {!loading && error && (
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Something went wrong"
                description={error}
                action={{
                  label: "Try again",
                  onClick: loadCommitments,
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <Card>
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="space-y-2"
                >
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading &&
          !error &&
          commitments.length === 0 && (
            <Card>
              <CardContent className="p-8">
                <EmptyState
                  icon={Target}
                  title="No commitments found"
                  description={
                    projectId
                      ? "This project does not have any commitments yet."
                      : "Enter a project ID above to view commitments."
                  }
                  action={
                    projectId
                      ? {
                          label: "Add Commitment",
                          onClick: () => {
                            setError(null);
                            setShowForm(true);
                          },
                        }
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          )}

        {/* Commitment List */}
        {!loading &&
          !error &&
          commitments.length > 0 && (
            <div className="grid gap-4">
              {commitments.map((commitment) => (
                <Card key={commitment.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            size="sm"
                          >
                            {typeLabel(
                              commitment.commitment_type,
                            )}
                          </Badge>

                          <Badge size="sm">
                            {statusLabel(
                              commitment.status,
                            )}
                          </Badge>
                        </div>

                        <h3 className="font-semibold text-slate-900">
                          {commitment.title}
                        </h3>

                        {commitment.description && (
                          <p className="text-sm text-slate-500 mt-1">
                            {commitment.description}
                          </p>
                        )}
                      </div>

                      <span className="text-sm font-semibold text-slate-600">
                        {commitment.progress}%
                      </span>
                    </div>

                    <div className="mt-4">
                      <Progress
                        value={commitment.progress}
                        size="sm"
                      />
                    </div>

                    <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
                      {commitment.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Due {commitment.due_date}
                        </span>
                      )}

                      {commitment.owner_id && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          Owner{" "}
                          {commitment.owner_id.slice(
                            0,
                            8,
                          )}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>
    </AuthenticatedLayout>
  );
}