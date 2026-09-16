"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  AlertCircle,
} from "lucide-react";
import {
  ApiError,
  buildQuery,
  normalizeRequirement,
  normalizeSprint,
  patchJson,
  postJson,
  useCollection,
  type RequirementItem,
  type SprintItem,
} from "@/lib/api-client";

const SPRINTS_PAGE_SIZE = 50;
// Bounded planning fetch: one page of at most 100 requirements, grouped
// client-side into available vs allocated. Full server pagination still
// applies (see footnote below the allocation card).
const REQUIREMENTS_PAGE_SIZE = 100;

/** Converts a server timestamp to a YYYY-MM-DD date-input value. */
function toDateInputValue(value: string | null): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  return value.slice(0, 10);
}

/** Whole-day difference between two YYYY-MM-DD values, or null. */
function estimateDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  const diff = Math.round((endTime - startTime) / 86_400_000);
  return diff < 0 ? null : diff;
}

export default function SprintPlanningPage() {
  const sprintsQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: SPRINTS_PAGE_SIZE }),
    [],
  );
  const {
    items: sprints,
    error: sprintsError,
    isLoading: sprintsLoading,
    retry: retrySprints,
  } = useCollection<SprintItem>("/api/sprints", normalizeSprint, sprintsQuery);

  const requirementsQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: REQUIREMENTS_PAGE_SIZE }),
    [],
  );
  const {
    items: requirements,
    pagination: requirementsPagination,
    error: requirementsError,
    isLoading: requirementsLoading,
    retry: retryRequirements,
  } = useCollection<RequirementItem>(
    "/api/requirements",
    normalizeRequirement,
    requirementsQuery,
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedSprint =
    sprints.find((sprint) => sprint.id === selectedId) ??
    sprints[0] ??
    null;

  // Sprint form state (controlled; synced from the selected sprint).
  const [sprintName, setSprintName] = React.useState("");
  const [sprintGoal, setSprintGoal] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [formSeed, setFormSeed] = React.useState<string | null>(null);
  if (selectedSprint !== null && formSeed !== selectedSprint.id) {
    setFormSeed(selectedSprint.id);
    setSprintName(selectedSprint.name);
    setSprintGoal(selectedSprint.goal ?? "");
    setStartDate(toDateInputValue(selectedSprint.startDate));
    setEndDate(toDateInputValue(selectedSprint.endDate));
  }

  const [saving, setSaving] = React.useState<"create" | "update" | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null);
  const [allocBusy, setAllocBusy] = React.useState<Record<string, boolean>>({});
  const [allocError, setAllocError] = React.useState<string | null>(null);

  // "Available" = real requirements with no sprint; "allocated" = real
  // requirements pointing at the selected sprint. The backend exposes no
  // dependency or AI-recommended-sprint fields, so none are shown.
  const availableRequirements = requirements.filter(
    (req) => req.sprintId === null,
  );
  const sprintAllocation =
    selectedSprint === null
      ? []
      : requirements.filter((req) => req.sprintId === selectedSprint.id);

  const allocatedPoints = sprintAllocation.reduce(
    (sum, req) => sum + (req.storyPoints ?? 0),
    0,
  );
  // The API exposes no team-capacity endpoint: the capacity card honestly
  // reflects the selected sprint's own planned points (total_points), not
  // an invented team capacity.
  const capacityTotal = selectedSprint?.totalPoints ?? null;
  const remainingPoints =
    capacityTotal !== null ? capacityTotal - allocatedPoints : null;

  const estimatedDays = estimateDays(startDate, endDate);

  const showLoading =
    (sprintsLoading && sprints.length === 0) ||
    (requirementsLoading && requirements.length === 0);
  const loadError =
    sprints.length === 0 && requirements.length === 0
      ? (sprintsError ?? requirementsError)
      : null;

  const retryAll = React.useCallback(() => {
    retrySprints();
    retryRequirements();
  }, [retrySprints, retryRequirements]);

  const selectSprint = (id: string) => {
    const sprint = sprints.find((entry) => entry.id === id) ?? null;
    setSelectedId(id);
    setFormError(null);
    setFormSuccess(null);
    if (sprint !== null) {
      setFormSeed(sprint.id);
      setSprintName(sprint.name);
      setSprintGoal(sprint.goal ?? "");
      setStartDate(toDateInputValue(sprint.startDate));
      setEndDate(toDateInputValue(sprint.endDate));
    }
  };

  /** Creates a sprint via POST /api/sprints from the form values. */
  const handleCreate = async () => {
    const name = sprintName.trim();
    if (name === "") {
      setFormError("Enter a sprint name before creating the sprint.");
      setFormSuccess(null);
      return;
    }
    // POST requires a projectId; the planning form has no project picker, so
    // it is derived from the planned requirements, which must share one
    // project. Anything else is reported honestly instead of guessed.
    const projectIds = Array.from(
      new Set(
        [...sprintAllocation, ...availableRequirements].map((req) => req.projectId),
      ),
    ).filter((id) => id !== "");
    if (projectIds.length !== 1 || !projectIds[0]) {
      setFormError(
        "Could not determine a single project for the new sprint. " +
          "Plan requirements from one project before creating the sprint.",
      );
      setFormSuccess(null);
      return;
    }
    setSaving("create");
    setFormError(null);
    setFormSuccess(null);
    try {
      const created = await postJson(
        "/api/sprints",
        {
          projectId: projectIds[0],
          name,
          goal: sprintGoal.trim() === "" ? null : sprintGoal.trim(),
          status: "planning",
          startDate: startDate === "" ? null : startDate,
          endDate: endDate === "" ? null : endDate,
        },
        normalizeSprint,
        { fallback: "Could not create sprint" },
      );
      if (created !== null) setSelectedId(created.id);
      setFormSuccess("Sprint created.");
      retrySprints();
    } catch (error: unknown) {
      setFormError(
        error instanceof ApiError ? error.message : "Could not create sprint.",
      );
    } finally {
      setSaving(null);
    }
  };

  /** Persists the form to the selected sprint via PATCH /api/sprints/:id. */
  const handleSave = async () => {
    if (selectedSprint === null) {
      setFormError("There is no sprint to save yet. Create one first.");
      setFormSuccess(null);
      return;
    }
    const name = sprintName.trim();
    if (name === "") {
      setFormError("The sprint name must not be empty.");
      setFormSuccess(null);
      return;
    }
    setSaving("update");
    setFormError(null);
    setFormSuccess(null);
    try {
      await patchJson(
        `/api/sprints/${selectedSprint.id}`,
        {
          name,
          goal: sprintGoal.trim() === "" ? null : sprintGoal.trim(),
          startDate: startDate === "" ? null : startDate,
          endDate: endDate === "" ? null : endDate,
        },
        normalizeSprint,
        { fallback: "Could not save sprint" },
      );
      setFormSuccess("Sprint saved.");
      retrySprints();
    } catch (error: unknown) {
      // Authorization failures (e.g. a developer without sprint UPDATE
      // rights) surface here verbatim — never hidden or bypassed.
      setFormError(
        error instanceof ApiError ? error.message : "Could not save sprint.",
      );
    } finally {
      setSaving(null);
    }
  };

  const handleCancel = () => {
    if (selectedSprint !== null) {
      setSprintName(selectedSprint.name);
      setSprintGoal(selectedSprint.goal ?? "");
      setStartDate(toDateInputValue(selectedSprint.startDate));
      setEndDate(toDateInputValue(selectedSprint.endDate));
    } else {
      setSprintName("");
      setSprintGoal("");
      setStartDate("");
      setEndDate("");
    }
    setFormError(null);
    setFormSuccess(null);
  };

  /** Assigns/unassigns a requirement via PATCH /api/requirements/:id. */
  const moveRequirement = async (
    requirementId: string,
    sprintId: string | null,
  ) => {
    if (sprintId !== null && selectedSprint === null) return;
    setAllocError(null);
    setAllocBusy((prev) => ({ ...prev, [requirementId]: true }));
    try {
      await patchJson(
        `/api/requirements/${requirementId}`,
        { sprintId },
        normalizeRequirement,
        { fallback: "Could not update the requirement assignment" },
      );
      retryRequirements();
    } catch (error: unknown) {
      setAllocError(
        error instanceof ApiError
          ? error.message
          : "Could not update the requirement assignment.",
      );
    } finally {
      setAllocBusy((prev) => {
        const next = { ...prev };
        delete next[requirementId];
        return next;
      });
    }
  };

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
          label: saving === "create" ? "Creating…" : "Generate Sprint",
          onClick: () => {
            void handleCreate();
          },
        }}
        secondaryActions={[
          {
            label: saving === "update" ? "Saving…" : "Save Draft",
            onClick: () => {
              void handleSave();
            },
          },
        ]}
      />

      {showLoading ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {[0, 1].map((index) => (
              <Card key={index}>
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : loadError !== null ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load planning data"
              description={loadError.message}
              action={{ label: "Try again", onClick: retryAll }}
            />
          </CardContent>
        </Card>
      ) : (
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sprint Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sprints.length > 0 ? (
                <Select
                  label="Sprint"
                  options={sprints.map((sprint) => ({
                    value: sprint.id,
                    label: sprint.name,
                  }))}
                  value={selectedSprint?.id ?? ""}
                  onChange={(e) => selectSprint(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  No sprints yet. Fill in the details below and use Generate
                  Sprint to create the first one.
                </p>
              )}
              {formError !== null ? (
                <p role="alert" className="text-sm text-rose-600">{formError}</p>
              ) : null}
              {formSuccess !== null ? (
                <p role="status" className="text-sm text-emerald-600">{formSuccess}</p>
              ) : null}
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
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
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
              {requirementsError !== null && requirements.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  Couldn&apos;t load requirements.{" "}
                  <button className="underline" onClick={retryRequirements}>
                    Try again
                  </button>
                </p>
              ) : availableRequirements.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No unassigned requirements. New requirements without a
                  sprint will show up here.
                </p>
              ) : (
              <div className="divide-y divide-slate-100">
                {availableRequirements.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          {req.displayId}
                        </span>
                        <Badge variant="outline" size="sm">
                          {req.status}
                        </Badge>
                      </div>
                      <p className="font-medium text-slate-900 mt-1">
                        {req.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {req.category || "Uncategorized"} · {req.priority} priority
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" size="sm">
                        {req.storyPoints ?? "—"}{req.storyPoints !== null ? " pts" : ""}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={selectedSprint === null || allocBusy[req.id] === true}
                        title={
                          selectedSprint === null
                            ? "Create or select a sprint first"
                            : "Assign to the selected sprint"
                        }
                        onClick={() => {
                          if (selectedSprint !== null) {
                            void moveRequirement(req.id, selectedSprint.id);
                          }
                        }}
                      >
                        {allocBusy[req.id] === true ? "Adding…" : "Add"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              )}
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
              {allocError !== null ? (
                <p role="alert" className="px-4 py-3 text-sm text-rose-700 bg-rose-50 border-y border-rose-100">
                  {allocError}
                </p>
              ) : null}
              {selectedSprint === null ? (
                <p className="p-4 text-sm text-slate-500">
                  Select or create a sprint to see its allocation.
                </p>
              ) : sprintAllocation.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  Nothing assigned to {selectedSprint.name} yet. Add
                  requirements from the list above.
                </p>
              ) : (
              <div className="divide-y divide-slate-100">
                {sprintAllocation.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <span className="font-mono text-xs text-slate-400">
                        {req.displayId}
                      </span>
                      <p className="font-medium text-slate-900">{req.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" size="sm">
                        {req.storyPoints ?? "—"}{req.storyPoints !== null ? " pts" : ""}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={allocBusy[req.id] === true}
                        onClick={() => {
                          void moveRequirement(req.id, null);
                        }}
                      >
                        {allocBusy[req.id] === true ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
          {/* Planning shows one page of requirements; the full set lives in
              the requirements API (`requirementsPagination.total` overall). */}
          {requirementsError === null && requirementsPagination.total > REQUIREMENTS_PAGE_SIZE ? (
            <p className="text-sm text-slate-500">
              Showing {requirements.length} of {requirementsPagination.total} requirements.
              Refine requirements to see more.
            </p>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Capacity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Capacity</CardTitle>
              <CardDescription>
                Planned points for the selected sprint. Team capacity is not
                exposed by the API, so no team capacity is shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-lg font-bold text-slate-900">
                    {capacityTotal ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500">Planned</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-lg font-bold text-blue-600">
                    {allocatedPoints}
                  </p>
                  <p className="text-xs text-slate-500">Allocated</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <p className="text-lg font-bold text-emerald-600">
                    {remainingPoints ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500">Remaining</p>
                </div>
              </div>
              {capacityTotal !== null && capacityTotal > 0 ? (
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min((allocatedPoints / capacityTotal) * 100, 100)}%` }}
                />
              </div>
              ) : null}
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
                <span className="font-medium text-slate-900">
                  {selectedSprint?.name ?? (sprintName.trim() === "" ? "—" : sprintName.trim())}
                </span>
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
                  {allocatedPoints}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Estimated Completion</span>
                <span className="font-medium text-slate-900">
                  {estimatedDays === null ? "—" : `${estimatedDays} Days`}
                </span>
              </div>
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <Button
                  className="w-full"
                  disabled={saving !== null}
                  onClick={() => {
                    void handleCreate();
                  }}
                >
                  {saving === "create" ? "Creating…" : "Generate Sprint"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={saving !== null}
                  onClick={() => {
                    void handleSave();
                  }}
                >
                  {saving === "update" ? "Saving…" : "Save Draft"}
                </Button>
                <Button variant="ghost" className="w-full" onClick={handleCancel}>
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
              {/* The API exposes no team-membership endpoint; no member
                  avatars or counts are shown instead of invented ones. */}
              <p className="text-sm text-slate-500">
                Team membership is not exposed by the API.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </AuthenticatedLayout>
  );
}
