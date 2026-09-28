"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import {
  AlertCircle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Layers,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { ProjectBreakdownResult, EpicBreakdown, TaskBreakdown } from "../../../ai/services/llm.client";

interface AiProjectBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
}

const SAMPLE_BRIEF =
  "Build an online food delivery platform where customers can browse restaurants, order food, pay online and track delivery.";

export function AiProjectBreakdownModal({
  isOpen,
  onClose,
  projectId,
  projectName: initialProjectName,
}: AiProjectBreakdownModalProps) {
  const router = useRouter();

  const [projectBrief, setProjectBrief] = React.useState(SAMPLE_BRIEF);
  const [projectName, setProjectName] = React.useState(initialProjectName || "Online Food Delivery Platform");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Generated Plan
  const [plan, setPlan] = React.useState<ProjectBreakdownResult | null>(null);
  const [expandedEpics, setExpandedEpics] = React.useState<Record<number, boolean>>({ 0: true, 1: true });

  // Persistence state
  const [isApproving, setIsApproving] = React.useState(false);
  const [approvedResult, setApprovedResult] = React.useState<{
    projectId: string;
    requirementsCreated: number;
    tasksCreated: number;
    sprintsCreated: number;
  } | null>(null);

  // Generate Plan Handler
  const handleGeneratePlan = async () => {
    if (!projectBrief.trim()) {
      setError("Please provide a project brief or requirements description.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectBrief: projectBrief.trim(), projectId }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setPlan(json.data);
      } else {
        setError(json?.error?.message || "Failed to generate AI breakdown. Please try again.");
      }
    } catch {
      setError("Network error calling AI breakdown service.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle Epic expansion
  const toggleEpic = (idx: number) => {
    setExpandedEpics((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Edit task in state
  const handleRemoveTask = (epicIdx: number, taskIdx: number) => {
    if (!plan) return;
    const newEpics = [...plan.epics];
    newEpics[epicIdx].tasks = newEpics[epicIdx].tasks.filter((_, i) => i !== taskIdx);
    setPlan({ ...plan, epics: newEpics });
  };

  const handleRemoveEpic = (epicIdx: number) => {
    if (!plan) return;
    const newEpics = plan.epics.filter((_, i) => i !== epicIdx);
    setPlan({ ...plan, epics: newEpics });
  };

  // Approve & Create
  const handleApproveAndCreate = async () => {
    if (!plan) return;
    setIsApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/breakdown/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName: projectName.trim(),
          projectDescription: projectBrief.trim(),
          epics: plan.epics,
          suggestedSprints: plan.suggestedSprints,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setApprovedResult(json.data);
      } else {
        setError(json?.error?.message || "Failed to persist project entities.");
      }
    } catch {
      setError("Network error persisting approved plan.");
    } finally {
      setIsApproving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-card/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                AI Project Breakdown
                <Badge variant="outline" className="text-[10px] uppercase bg-primary/10 text-primary border-primary/30">
                  MVP Feature
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                Turn a high-level project vision into actionable Epics, Tasks, and Sprint Plans with human review.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {approvedResult ? (
            /* Success confirmation */
            <div className="p-8 text-center space-y-6 animate-in fade-in zoom-in-95">
              <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-full mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Project Plan Approved & Created!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  All requirements, backlog tasks, and sprint plans have been generated and committed to the live database.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-xs text-muted-foreground block">Epics</span>
                  <span className="text-lg font-bold text-foreground">{approvedResult.requirementsCreated}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-xs text-muted-foreground block">Tasks</span>
                  <span className="text-lg font-bold text-primary">{approvedResult.tasksCreated}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-xs text-muted-foreground block">Sprints</span>
                  <span className="text-lg font-bold text-emerald-500">{approvedResult.sprintsCreated}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  onClick={() => {
                    onClose();
                    router.push("/sprint-planning");
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
                >
                  <Layers className="w-4 h-4" />
                  Open Sprint Planning
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    onClose();
                    router.push(`/projects/${approvedResult.projectId}`);
                  }}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Project Workspace
                </Button>
              </div>
            </div>
          ) : !plan ? (
            /* Prompt input stage */
            <div className="space-y-4">
              {!projectId && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Project Name
                  </label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Online Food Delivery Platform"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Project Brief / Requirements Description
                  </label>
                  <button
                    type="button"
                    onClick={() => setProjectBrief(SAMPLE_BRIEF)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Insert Demo Brief
                  </button>
                </div>
                <Textarea
                  rows={5}
                  value={projectBrief}
                  onChange={(e) => setProjectBrief(e.target.value)}
                  placeholder="Describe what you want to build in plain English..."
                  className="text-sm resize-none"
                />
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border/60 flex items-start gap-3">
                <Bot className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">How SmartSprint AI breakdown works:</p>
                  <p>
                    1. AI analyzes your brief and generates modular epics with granular, estimated tasks.
                  </p>
                  <p>
                    2. You review, edit, or adjust tasks and priorities in the interactive preview.
                  </p>
                  <p>
                    3. Only upon explicit human approval are records written to the database.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Preview & Human Review Stage */
            <div className="space-y-6">
              {/* Summary */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    AI Project Summary
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {plan.epics.length} Epics •{" "}
                    {plan.epics.reduce((sum, e) => sum + e.tasks.length, 0)} Tasks
                  </Badge>
                </div>
                <p className="text-xs text-foreground/90">{plan.projectSummary}</p>
              </div>

              {/* Epics & Tasks List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Epics & Work Items
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    Review and customize before approving
                  </span>
                </div>

                {plan.epics.map((epic, eIdx) => (
                  <Card key={eIdx} className="border-border/60 overflow-hidden">
                    <div
                      className="p-3.5 bg-muted/20 border-b border-border/40 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleEpic(eIdx)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedEpics[eIdx] ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-semibold text-sm">{epic.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0">
                          {epic.tasks.length} tasks
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRemoveEpic(eIdx)}
                          className="text-muted-foreground hover:text-red-500 p-1"
                          title="Remove Epic"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedEpics[eIdx] && (
                      <CardContent className="p-3 space-y-2">
                        {epic.description && (
                          <p className="text-xs text-muted-foreground px-1 pb-1">
                            {epic.description}
                          </p>
                        )}

                        <div className="space-y-2">
                          {epic.tasks.map((task, tIdx) => (
                            <div
                              key={tIdx}
                              className="p-3 rounded-lg border border-border/50 bg-card hover:border-border transition-colors flex flex-col gap-2"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h5 className="text-xs font-semibold text-foreground">
                                    {task.title}
                                  </h5>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {task.description}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleRemoveTask(eIdx, tIdx)}
                                  className="text-muted-foreground hover:text-red-500 p-1"
                                  title="Remove Task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Acceptance Criteria */}
                              {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-border/30">
                                  <span className="text-[10px] font-semibold text-muted-foreground block uppercase">
                                    Acceptance Criteria:
                                  </span>
                                  <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-0.5">
                                    {task.acceptanceCriteria.map((ac, acIdx) => (
                                      <li key={acIdx}>{ac}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Badges */}
                              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 uppercase ${
                                      task.priority === "critical"
                                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                                        : task.priority === "high"
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {task.priority}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {task.estimatedHours} hrs ({Math.max(1, Math.round(task.estimatedHours / 2))} pts)
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>

              {/* Suggested Sprints */}
              {plan.suggestedSprints && plan.suggestedSprints.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-500" />
                    Suggested Sprint Breakdown
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {plan.suggestedSprints.map((sprint, sIdx) => (
                      <div
                        key={sIdx}
                        className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-foreground">
                            {sprint.name}
                          </span>
                          <Badge variant="outline" className="text-[10px] bg-background">
                            {sprint.taskIndexes.length} tasks
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {sprint.goal}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-card/80 flex items-center justify-between">
          {!plan && !approvedResult ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGeneratePlan}
                disabled={isGenerating || !projectBrief.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing & Generating Plan...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate AI Plan
                  </>
                )}
              </Button>
            </>
          ) : plan && !approvedResult ? (
            <>
              <Button
                variant="outline"
                onClick={() => setPlan(null)}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate / Edit Brief
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApproveAndCreate}
                  disabled={isApproving || plan.epics.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 font-medium"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Entities in DB...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Approve & Create Entities
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
