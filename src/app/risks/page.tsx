"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Flame,
  Layers,
  Lightbulb,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { buildQuery, normalizeProject, useCollection, type ProjectItem } from "@/lib/api-client";

interface RiskItem {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  description: string | null;
  probability: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string | null;
  status: "open" | "mitigated" | "closed";
  source: "ai" | "manual";
  createdAt: string;
}

const riskLevelValue: Record<RiskItem["probability"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const getRiskExposure = (risk: RiskItem) =>
  riskLevelValue[risk.probability] * riskLevelValue[risk.impact];

const getExposureLabel = (exposure: number) => {
  if (exposure >= 7) return "Critical";
  if (exposure >= 5) return "High";
  if (exposure >= 3) return "Medium";
  return "Low";
};

export default function RisksPage() {
  const { items: projects, isLoading: projectsLoading } = useCollection<ProjectItem>(
    "/api/projects",
    normalizeProject,
    React.useMemo(() => buildQuery({ page: 1, pageSize: 50 }), [])
  );

  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("all");
  const [risks, setRisks] = React.useState<RiskItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");

  const [selectedRisk, setSelectedRisk] = React.useState<RiskItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [editStatus, setEditStatus] = React.useState<"open" | "mitigated" | "closed">("open");
  const [editMitigation, setEditMitigation] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Fetch risks
  const fetchRisks = React.useCallback(async (analyze = false) => {
    setIsLoading(true);
    try {
      const url =
        selectedProjectId !== "all"
          ? `/api/risks?projectId=${selectedProjectId}&analyze=${analyze ? "true" : "false"}`
          : `/api/risks?analyze=${analyze ? "true" : "false"}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRisks(json.data);
      }
    } catch {
      setRisks([]);
    } finally {
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  }, [selectedProjectId]);

  React.useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    await fetchRisks(true);
  };

  const handleSaveRisk = async () => {
    if (!selectedRisk) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/risks/${selectedRisk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          mitigation: editMitigation.trim() || null,
        }),
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        fetchRisks();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const openRiskModal = (risk: RiskItem) => {
    setSelectedRisk(risk);
    setEditStatus(risk.status);
    setEditMitigation(risk.mitigation || "");
    setIsEditModalOpen(true);
  };

  const filteredRisks = React.useMemo(() => {
    return risks.filter((r) => {
      if (searchQuery.trim() && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (severityFilter !== "all" && r.impact !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [risks, searchQuery, statusFilter, severityFilter]);

  const openCount = risks.filter((r) => r.status === "open").length;
  const highSeverityCount = risks.filter((r) => r.status === "open" && (r.impact === "high" || r.probability === "high")).length;
  const mitigatedCount = risks.filter((r) => r.status === "mitigated").length;

  return (
    <AuthenticatedLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <PageHeader
          title="Project Risk Intelligence"
          description="Continuous deterministic risk detection across deadlines, blockers, developer workload, and sprint delivery."
          actions={
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning Project...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Run AI Risk Analysis
                  </>
                )}
              </Button>
            </div>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
                  Active Risks
                </span>
                <span className="text-2xl font-bold text-foreground mt-1 block">{openCount}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
                  High Severity
                </span>
                <span className="text-2xl font-bold text-red-500 mt-1 block">{highSeverityCount}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
                  Mitigated Risks
                </span>
                <span className="text-2xl font-bold text-emerald-500 mt-1 block">{mitigatedCount}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <Card className="border-border/60">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Project Filter */}
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Accessible Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="mitigated">Mitigated</option>
                <option value="closed">Closed</option>
              </select>

              {/* Severity Filter */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Severities</option>
                <option value="high">High Impact</option>
                <option value="medium">Medium Impact</option>
                <option value="low">Low Impact</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search risk title or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Risk Items List */}
        <div className="space-y-3">
          {isLoading && risks.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : filteredRisks.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <EmptyState
                title="No active risks detected"
                description={
                  searchQuery || statusFilter !== "all"
                    ? "No risks match the current filter selection."
                    : "SmartSprint AI has detected no overdue deadlines, prolonged blockers, or workload bottlenecks."
                }
                action={{
                  label: "Scan Project Now",
                  onClick: handleRunAnalysis,
                }}
              />
            </Card>
          ) : (
            filteredRisks.map((risk) => (
              <Card
                key={risk.id}
                className={`border-border/60 hover:border-primary/40 transition-colors ${
                  risk.status === "open" && risk.impact === "high"
                    ? "bg-red-500/5 dark:bg-red-950/10 border-red-500/20"
                    : "bg-card"
                }`}
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{risk.title}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                          risk.impact === "high"
                            ? "bg-red-500/10 text-red-500 border-red-500/30"
                            : risk.impact === "medium"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {risk.impact} Impact
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                          risk.status === "open"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : risk.status === "mitigated"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {risk.status}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
                      >
                        {risk.source === "ai" ? "AI Detected" : "Manual"}
                      </Badge>
                    </div>

                    {/* Risk Exposure: Probability × Impact */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1">
                        <span className="text-muted-foreground">Probability:</span>{" "}
                        <span className="font-semibold capitalize">{risk.probability}</span>
                      </span>
                      <span className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1">
                        <span className="text-muted-foreground">Impact:</span>{" "}
                        <span className="font-semibold capitalize">{risk.impact}</span>
                      </span>
                      <span className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1">
                        <span className="text-muted-foreground">Risk Exposure:</span>{" "}
                        <span className="font-bold text-primary">
                          {getRiskExposure(risk)}
                        </span>
                        <span className="text-muted-foreground"> / 9</span>
                      </span>
                      <span className="rounded-lg border border-border/60 bg-background px-2.5 py-1 font-semibold">
                        {getExposureLabel(getRiskExposure(risk))}
                      </span>
                    </div>

                    {risk.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {risk.description}
                      </p>
                    )}

                    {/* AI Recommendation */}
                    {risk.mitigation && (
                      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-primary dark:text-primary">
                        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                        <div>
                          <strong className="font-semibold block mb-0.5">AI Recommended Action:</strong>
                          <span className="text-foreground/80">{risk.mitigation}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex md:flex-col items-center md:items-end justify-between gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                    <span className="text-[11px] text-muted-foreground">
                      Detected {risk.createdAt ? risk.createdAt.slice(0, 10) : "Today"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRiskModal(risk)}
                      className="text-xs h-8"
                    >
                      Update Status
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Modal: Update Risk Status */}
        {isEditModalOpen && selectedRisk && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-base font-bold">Update Risk Status</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">{selectedRisk.title}</h4>
                  <p className="text-muted-foreground mt-1">{selectedRisk.description}</p>
                </div>

                <div>
                  <label className="font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Risk Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-primary"
                  >
                    <option value="open">Open (Active Risk)</option>
                    <option value="mitigated">Mitigated (Action Taken)</option>
                    <option value="closed">Closed (Resolved / Dismissed)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Mitigation Plan & Notes
                  </label>
                  <textarea
                    rows={4}
                    value={editMitigation}
                    onChange={(e) => setEditMitigation(e.target.value)}
                    placeholder="Document actions taken or assignees briefed..."
                    className="w-full p-2.5 rounded-lg border border-input bg-background text-xs resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveRisk} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
