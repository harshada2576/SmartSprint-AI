"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Download,
  Loader2,
  Plus,
} from "lucide-react";

// API rows are snake_case (governance + risks routes return raw rows).
interface BudgetRow {
  id: string;
  category: string;
  allocated: string | number;
  spent: string | number;
}

interface ContractRow {
  id: string;
  name: string;
  vendor: string;
  value: string | number;
  status: string;
  expiry: string | null;
}

interface ApprovalRow {
  id: string;
  title: string;
  type: string;
  status: string;
  requester_id: string | null;
  requested_at: string | null;
  decided_reason: string | null;
  decided_at: string | null;
}

interface ChangeRow {
  id: string;
  title: string;
  type: string;
  impact: string;
  status: string;
  requester_id: string | null;
  requested_at: string | null;
}

interface RiskRow {
  id: string;
  title: string;
  probability: string;
  impact: string;
  owner_id: string | null;
  mitigation: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

type GovernanceResource =
  | "budget"
  | "contracts"
  | "approvals"
  | "changes";

const money = (value: string | number): string => {
  const num = typeof value === "number" ? value : Number(value);
  return `$${(Number.isFinite(num) ? num : 0).toLocaleString()}`;
};

const shortId = (value: string | null): string =>
  typeof value === "string" && value.length > 8
    ? `${value.slice(0, 8)}…`
    : (value ?? "—");

const formatDate = (value: string | null): string => {
  if (!value) return "—";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "—" : new Date(value).toLocaleDateString();
};

async function fetchGovernanceRows<T>(
  resource: GovernanceResource | "risks",
  projectId: string,
): Promise<T[]> {
  const url =
    resource === "risks"
      ? `/api/risks?projectId=${projectId}`
      : `/api/governance?resource=${resource}&projectId=${projectId}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success !== true || !Array.isArray(json.data)) {
    throw new Error(
      (json && typeof json.error === "string" && json.error) ||
        `Failed to load ${resource}`,
    );
  }
  return json.data as T[];
}

export default function GovernancePage() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] =
    React.useState<string>("");
  const [rows, setRows] = React.useState<{
    budget: BudgetRow[];
    contracts: ContractRow[];
    approvals: ApprovalRow[];
    changes: ChangeRow[];
    risks: RiskRow[];
  }>({ budget: [], contracts: [], approvals: [], changes: [], risks: [] });
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [decisions, setDecisions] = React.useState<
    Record<string, { reason: string; busy: boolean; error: string | null }>
  >({});
  const [showContractForm, setShowContractForm] =
    React.useState<boolean>(false);
  const [showChangeForm, setShowChangeForm] =
    React.useState<boolean>(false);
  const [contractForm, setContractForm] = React.useState({
    name: "",
    vendor: "",
    value: "",
    status: "pending",
    expiry: "",
  });
  const [changeForm, setChangeForm] = React.useState({
    title: "",
    type: "feature",
    impact: "medium",
    description: "",
  });
  const [formBusy, setFormBusy] = React.useState<boolean>(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Load projects for the selector.
  React.useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          const list = (data.projects || data.data || []) as ProjectOption[];
          setProjects(list);
          if (list.length > 0) setSelectedProjectId(list[0].id);
          else setLoading(false);
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const loadAll = React.useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [budget, contracts, approvals, changes, risks] =
        await Promise.all([
          fetchGovernanceRows<BudgetRow>("budget", projectId),
          fetchGovernanceRows<ContractRow>("contracts", projectId),
          fetchGovernanceRows<ApprovalRow>("approvals", projectId),
          fetchGovernanceRows<ChangeRow>("changes", projectId),
          fetchGovernanceRows<RiskRow>("risks", projectId),
        ]);
      setRows({ budget, contracts, approvals, changes, risks });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load governance data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProjectId) loadAll(selectedProjectId);
  }, [selectedProjectId, loadAll]);

  const handleDecision = async (
    resource: "approvals" | "changes",
    id: string,
    decision: "approved" | "rejected",
  ) => {
    const entry = decisions[id] ?? { reason: "", busy: false, error: null };
    setDecisions((prev) => ({
      ...prev,
      [id]: { ...entry, busy: true, error: null },
    }));
    try {
      const res = await fetch(
        `/api/governance/${id}?resource=${resource}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: entry.reason.trim() || undefined,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json?.error?.message as string | undefined) ||
            `Failed to ${decision} request`,
        );
      }
      setDecisions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadAll(selectedProjectId);
    } catch (err) {
      setDecisions((prev) => ({
        ...prev,
        [id]: {
          ...entry,
          busy: false,
          error:
            err instanceof Error ? err.message : "Decision failed",
        },
      }));
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "contracts",
          projectId: selectedProjectId,
          name: contractForm.name.trim(),
          vendor: contractForm.vendor.trim(),
          value: Number(contractForm.value),
          status: contractForm.status,
          expiry: contractForm.expiry || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error?.message || "Failed to create contract",
        );
      }
      setContractForm({
        name: "",
        vendor: "",
        value: "",
        status: "pending",
        expiry: "",
      });
      setShowContractForm(false);
      await loadAll(selectedProjectId);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create contract",
      );
    } finally {
      setFormBusy(false);
    }
  };

  const handleCreateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "changes",
          projectId: selectedProjectId,
          title: changeForm.title.trim(),
          type: changeForm.type,
          impact: changeForm.impact,
          description: changeForm.description.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error?.message || "Failed to create change request",
        );
      }
      setChangeForm({
        title: "",
        type: "feature",
        impact: "medium",
        description: "",
      });
      setShowChangeForm(false);
      await loadAll(selectedProjectId);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to create change request",
      );
    } finally {
      setFormBusy(false);
    }
  };

  const handleExportBudget = () => {
    const lines = ["Category,Allocated,Spent,Remaining"];
    for (const item of rows.budget) {
      const allocated = Number(item.allocated) || 0;
      const spent = Number(item.spent) || 0;
      lines.push(
        `"${item.category.replace(/"/g, '""')}",${allocated},${spent},${allocated - spent}`,
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "budget-overview.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderDecisionCell = (
    resource: "approvals" | "changes",
    row: { id: string; status: string; decided_reason?: string | null },
  ) => {
    if (row.status !== "pending") {
      return (
        <span className="text-xs text-muted-foreground">
          {row.decided_reason || "—"}
        </span>
      );
    }
    const entry = decisions[row.id] ?? {
      reason: "",
      busy: false,
      error: null,
    };
    return (
      <div className="flex flex-col gap-1 min-w-52">
        <input
          aria-label="Decision reason"
          placeholder="Reason (optional)"
          value={entry.reason}
          disabled={entry.busy}
          onChange={(e) =>
            setDecisions((prev) => ({
              ...prev,
              [row.id]: { ...entry, reason: e.target.value },
            }))
          }
          className="bg-card text-card-foreground border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={entry.busy}
            onClick={() => handleDecision(resource, row.id, "approved")}
          >
            {entry.busy ? "..." : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={entry.busy}
            onClick={() => handleDecision(resource, row.id, "rejected")}
          >
            {entry.busy ? "..." : "Reject"}
          </Button>
        </div>
        {entry.error && (
          <span className="text-xs text-red-500">{entry.error}</span>
        )}
      </div>
    );
  };

  const emptyRow = (label: string) => (
    <TableRow>
      <TableCell
        colSpan={8}
        className="text-center text-muted-foreground text-sm py-6"
      >
        {label}
      </TableCell>
    </TableRow>
  );

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Governance Center"
        description="Manage approvals, contracts, budgets, and compliance"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Governance" },
        ]}
        actions={
          <select
            aria-label="Select Project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
          <p>Loading governance records...</p>
        </div>
      ) : error ? (
        <Card className="p-6 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-500">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => loadAll(selectedProjectId)}
          >
            Retry
          </Button>
        </Card>
      ) : (
        <Tabs defaultValue="budget">
          <TabsList>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="risks">Risk Register</TabsTrigger>
            <TabsTrigger value="changes">Change Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="budget" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Budget Overview</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportBudget}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead>Spent</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.budget.length === 0
                      ? emptyRow("No budget lines recorded for this project yet.")
                      : rows.budget.map((item) => {
                          const allocated = Number(item.allocated) || 0;
                          const spent = Number(item.spent) || 0;
                          const over = spent > allocated;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium text-slate-900">
                                {item.category}
                              </TableCell>
                              <TableCell>{money(allocated)}</TableCell>
                              <TableCell>{money(spent)}</TableCell>
                              <TableCell>{money(allocated - spent)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={over ? "danger" : "success"}
                                  size="sm"
                                >
                                  {over ? "Over Budget" : "On Track"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contracts" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Contracts</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowContractForm((v) => !v);
                    setFormError(null);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Contract
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {showContractForm && (
                  <form
                    onSubmit={handleCreateContract}
                    className="p-4 border-b border-border grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    <input
                      aria-label="Contract name"
                      required
                      placeholder="Contract name"
                      value={contractForm.name}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      aria-label="Vendor"
                      required
                      placeholder="Vendor"
                      value={contractForm.vendor}
                      onChange={(e) =>
                        setContractForm((f) => ({
                          ...f,
                          vendor: e.target.value,
                        }))
                      }
                      className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      aria-label="Value"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Value"
                      value={contractForm.value}
                      onChange={(e) =>
                        setContractForm((f) => ({
                          ...f,
                          value: e.target.value,
                        }))
                      }
                      className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      aria-label="Expiry"
                      type="date"
                      value={contractForm.expiry}
                      onChange={(e) =>
                        setContractForm((f) => ({
                          ...f,
                          expiry: e.target.value,
                        }))
                      }
                      className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {formError && (
                      <p className="text-xs text-red-500 md:col-span-2">
                        {formError}
                      </p>
                    )}
                    <div className="md:col-span-2">
                      <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={formBusy}
                      >
                        {formBusy ? "Saving..." : "Save Contract"}
                      </Button>
                    </div>
                  </form>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.contracts.length === 0
                      ? emptyRow("No contracts recorded for this project yet.")
                      : rows.contracts.map((contract) => (
                          <TableRow key={contract.id}>
                            <TableCell className="font-medium text-slate-900">
                              {contract.name}
                            </TableCell>
                            <TableCell>{contract.vendor}</TableCell>
                            <TableCell>{money(contract.value)}</TableCell>
                            <TableCell>
                              <StatusChip status={contract.status} size="sm" />
                            </TableCell>
                            <TableCell>{contract.expiry || "—"}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.approvals.length === 0
                      ? emptyRow("No approval requests for this project yet.")
                      : rows.approvals.map((approval) => (
                          <TableRow key={approval.id}>
                            <TableCell className="font-medium text-slate-900">
                              {approval.title}
                            </TableCell>
                            <TableCell>
                              {shortId(approval.requester_id)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" size="sm">
                                {approval.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <StatusChip status={approval.status} size="sm" />
                            </TableCell>
                            <TableCell>
                              {formatDate(approval.requested_at)}
                            </TableCell>
                            <TableCell>
                              {renderDecisionCell("approvals", approval)}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risks" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Risk Register</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push("/risks")}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Risk
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk</TableHead>
                      <TableHead>Probability</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.risks.length === 0
                      ? emptyRow("No risks recorded for this project yet.")
                      : rows.risks.map((risk) => (
                          <TableRow key={risk.id}>
                            <TableCell className="font-medium text-slate-900">
                              {risk.title}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={risk.probability === "high" ? "danger" : risk.probability === "medium" ? "warning" : "default"}
                                size="sm"
                              >
                                {risk.probability}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={risk.impact === "high" ? "danger" : risk.impact === "medium" ? "warning" : "default"}
                                size="sm"
                              >
                                {risk.impact}
                              </Badge>
                            </TableCell>
                            <TableCell>{shortId(risk.owner_id)}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="changes" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Change Requests</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowChangeForm((v) => !v);
                    setFormError(null);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Request
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {showChangeForm && (
                  <form
                    onSubmit={handleCreateChange}
                    className="p-4 border-b border-border grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    <input
                      aria-label="Request title"
                      required
                      placeholder="Request title"
                      value={changeForm.title}
                      onChange={(e) =>
                        setChangeForm((f) => ({
                          ...f,
                          title: e.target.value,
                        }))
                      }
                      className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        aria-label="Request type"
                        value={changeForm.type}
                        onChange={(e) =>
                          setChangeForm((f) => ({
                            ...f,
                            type: e.target.value,
                          }))
                        }
                        className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="feature">feature</option>
                        <option value="technical">technical</option>
                        <option value="process">process</option>
                      </select>
                      <select
                        aria-label="Impact"
                        value={changeForm.impact}
                        onChange={(e) =>
                          setChangeForm((f) => ({
                            ...f,
                            impact: e.target.value,
                          }))
                        }
                        className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    {formError && (
                      <p className="text-xs text-red-500 md:col-span-2">
                        {formError}
                      </p>
                    )}
                    <div className="md:col-span-2">
                      <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={formBusy}
                      >
                        {formBusy ? "Saving..." : "Submit Request"}
                      </Button>
                    </div>
                  </form>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.changes.length === 0
                      ? emptyRow("No change requests for this project yet.")
                      : rows.changes.map((cr) => (
                          <TableRow key={cr.id}>
                            <TableCell className="font-mono text-xs text-slate-500">
                              {shortId(cr.id)}
                            </TableCell>
                            <TableCell className="font-medium text-slate-900">
                              {cr.title}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" size="sm">
                                {cr.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={cr.impact === "high" ? "danger" : cr.impact === "medium" ? "warning" : "default"}
                                size="sm"
                              >
                                {cr.impact}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <StatusChip status={cr.status} size="sm" />
                            </TableCell>
                            <TableCell>{shortId(cr.requester_id)}</TableCell>
                            <TableCell>
                              {renderDecisionCell("changes", cr)}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AuthenticatedLayout>
  );
}
