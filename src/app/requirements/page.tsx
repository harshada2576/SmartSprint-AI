"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusChip, PriorityChip } from "@/components/ui/StatusChip";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Plus,
  Filter,
  Download,
  Upload,
  MoreHorizontal,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ListTodo,
} from "lucide-react";

const stats = [
  { label: "Total Requirements", value: 65, icon: FileText },
  { label: "Pending Validation", value: 12, icon: Clock },
  { label: "Ready for AI", value: 18, icon: Sparkles },
  { label: "Approved", value: 35, icon: CheckCircle },
];

const requirements = [
  {
    id: "REQ-001",
    title: "User Authentication with Multi-Factor Authentication",
    category: "Security",
    businessValue: "High",
    strategicRating: "High",
    complexityWeeks: "6",
    customerImportance: "Must Have",
    themeCategory: "Security",
    categoryDivisor: "3",
    status: "approved",
    priority: "high",
    predictedPriority: "high",
    predictionConfidence: 94,
    aiExplanation:
      "Security and compliance weighting pushes this into the highest priority band.",
    sprint: "Sprint 1",
    assignee: "John Smith",
    lastUpdated: "2 hours ago",
  },
  {
    id: "REQ-002",
    title: "Product Catalog Search and Filtering",
    category: "Feature",
    businessValue: "High",
    strategicRating: "High",
    complexityWeeks: "4",
    customerImportance: "Must Have",
    themeCategory: "Commerce",
    categoryDivisor: "2",
    status: "inProgress",
    priority: "high",
    predictedPriority: "high",
    predictionConfidence: 91,
    aiExplanation:
      "Strong customer impact and fast implementation make this a high-priority item.",
    sprint: "Sprint 2",
    assignee: "Sarah Chen",
    lastUpdated: "5 hours ago",
  },
  {
    id: "REQ-003",
    title: "Shopping Cart Persistence",
    category: "Feature",
    businessValue: "Medium",
    strategicRating: "Medium",
    complexityWeeks: "3",
    customerImportance: "Should Have",
    themeCategory: "Commerce",
    categoryDivisor: "2",
    status: "pending",
    priority: "medium",
    predictedPriority: "medium",
    predictionConfidence: 87,
    aiExplanation:
      "Useful for retention, but not as time-sensitive as transaction-critical work.",
    sprint: "Sprint 3",
    assignee: "Unassigned",
    lastUpdated: "1 day ago",
  },
  {
    id: "REQ-004",
    title: "Payment Gateway Integration",
    category: "Feature",
    businessValue: "High",
    strategicRating: "High",
    complexityWeeks: "5",
    customerImportance: "Must Have",
    themeCategory: "Payments",
    categoryDivisor: "3",
    status: "review",
    priority: "high",
    predictedPriority: "high",
    predictionConfidence: 96,
    aiExplanation:
      "Direct revenue dependency and launch impact drive the high prediction.",
    sprint: "Sprint 2",
    assignee: "Mike Johnson",
    lastUpdated: "3 hours ago",
  },
  {
    id: "REQ-005",
    title: "Order Tracking System",
    category: "Feature",
    businessValue: "Medium",
    strategicRating: "Medium",
    complexityWeeks: "2",
    customerImportance: "Should Have",
    themeCategory: "Logistics",
    categoryDivisor: "2",
    status: "draft",
    priority: "medium",
    predictedPriority: "medium",
    predictionConfidence: 83,
    aiExplanation:
      "Customer value is clear, but the feature can wait until core flows stabilize.",
    sprint: "-",
    assignee: "Unassigned",
    lastUpdated: "2 days ago",
  },
  {
    id: "REQ-006",
    title: "Customer Review and Rating System",
    category: "Feature",
    businessValue: "Low",
    strategicRating: "Low",
    complexityWeeks: "2",
    customerImportance: "Could Have",
    themeCategory: "Engagement",
    categoryDivisor: "1",
    status: "draft",
    priority: "low",
    predictedPriority: "low",
    predictionConfidence: 79,
    aiExplanation:
      "Engagement value exists, but the recommendation engine deprioritizes it versus launch blockers.",
    sprint: "-",
    assignee: "Unassigned",
    lastUpdated: "3 days ago",
  },
];

const awaitingAction = [
  { id: 1, title: "REQ-003 needs validation", type: "validation", action: "Validate" },
  { id: 2, title: "REQ-005 missing business value", type: "missing", action: "Add Value" },
  { id: 3, title: "REQ-004 awaiting approval", type: "approval", action: "Review" },
];

const filters = [
  { label: "All", value: "all", count: 65 },
  { label: "Draft", value: "draft", count: 15 },
  { label: "Pending", value: "pending", count: 12 },
  { label: "In Progress", value: "inProgress", count: 8 },
  { label: "Review", value: "review", count: 5 },
  { label: "Approved", value: "approved", count: 25 },
];

const businessValueOptions = [
  { value: "High", label: "High / Strategic" },
  { value: "Medium", label: "Medium / Tactical" },
  { value: "Low", label: "Low / Operational" },
];

const customerImportanceOptions = [
  { value: "Must Have", label: "Must Have" },
  { value: "Should Have", label: "Should Have" },
  { value: "Could Have", label: "Could Have" },
  { value: "Won't Have", label: "Won't Have" },
];

const themeCategoryOptions = [
  { value: "Security", label: "Security" },
  { value: "Commerce", label: "Commerce" },
  { value: "Payments", label: "Payments" },
  { value: "Logistics", label: "Logistics" },
  { value: "Engagement", label: "Engagement" },
  { value: "Operations", label: "Operations" },
];

const categoryOptions = [
  { value: "Feature", label: "Feature" },
  { value: "Security", label: "Security" },
  { value: "Enhancement", label: "Enhancement" },
  { value: "UI/UX", label: "UI/UX" },
];

const emptyFormState = {
  title: "",
  description: "",
  category: "Feature",
  businessValue: "Medium",
  strategicRating: "Medium",
  complexityWeeks: "4",
  customerImportance: "Should Have",
  themeCategory: "Operations",
  categoryDivisor: "2",
  predictedPriority: "medium",
  predictionConfidence: "82",
  aiExplanation:
    "Prediction confidence and SHAP rationale will appear here after analysis.",
};

function getPriorityBadgeVariant(priority: string) {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  if (priority === "low") return "success";
  return "default";
}

export default function RequirementsPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isRequirementModalOpen, setIsRequirementModalOpen] = React.useState(false);
  const [editingRequirementId, setEditingRequirementId] = React.useState<string | null>(null);
  const [formState, setFormState] = React.useState(emptyFormState);

  const openRequirementModal = (requirement?: (typeof requirements)[number]) => {
    if (requirement) {
      setEditingRequirementId(requirement.id);
      setFormState({
        title: requirement.title,
        description: `Requirement category: ${requirement.category}`,
        category: requirement.category,
        businessValue: requirement.businessValue,
        strategicRating: requirement.strategicRating,
        complexityWeeks: requirement.complexityWeeks,
        customerImportance: requirement.customerImportance,
        themeCategory: requirement.themeCategory,
        categoryDivisor: requirement.categoryDivisor,
        predictedPriority: requirement.predictedPriority,
        predictionConfidence: String(requirement.predictionConfidence),
        aiExplanation: requirement.aiExplanation,
      });
    } else {
      setEditingRequirementId(null);
      setFormState(emptyFormState);
    }

    setIsRequirementModalOpen(true);
  };

  const filteredRequirements = requirements.filter((req) => {
    const matchesFilter = activeFilter === "all" || req.status === activeFilter;
    const matchesSearch =
      searchQuery === "" ||
      req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

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
          onClick: () => openRequirementModal(),
        }}
        secondaryActions={[
          {
            label: "Import",
            onClick: () => { },
          },
          {
            label: "Export",
            onClick: () => { },
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
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFilter === filter.value
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
              >
                {filter.label}
                <span
                  className={`ml-2 px-1.5 py-0.5 rounded text-xs ${activeFilter === filter.value
                      ? "bg-white/20"
                      : "bg-slate-100"
                    }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <SearchInput
              placeholder="Search requirements..."
              value={searchQuery}
              onChange={setSearchQuery}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Business Value</TableHead>
                    <TableHead>AI Prediction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequirements.map((req) => (
                    <TableRow
                      key={req.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/requirements/${req.id}`)}
                    >
                      <TableCell className="font-mono text-xs text-slate-500">
                        {req.id}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 max-w-xs truncate">
                        {req.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm">
                          {req.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.businessValue === "High"
                              ? "success"
                              : req.businessValue === "Medium"
                                ? "warning"
                                : "default"
                          }
                          size="sm"
                        >
                          {req.businessValue}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={getPriorityBadgeVariant(req.predictedPriority) as never} size="sm">
                            {req.predictedPriority.charAt(0).toUpperCase() + req.predictedPriority.slice(1)}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {req.predictionConfidence}% confidence
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={req.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <PriorityChip priority={req.priority} size="sm" />
                      </TableCell>
                      <TableCell>{req.sprint}</TableCell>
                      <TableCell>{req.assignee}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRequirementModal(req);
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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

      <Modal
        isOpen={isRequirementModalOpen}
        onClose={() => setIsRequirementModalOpen(false)}
        title={editingRequirementId ? "Edit Requirement" : "Add Requirement"}
        description="Capture the AI model inputs now so the prioritization pipeline stays aligned with the UI."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsRequirementModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsRequirementModalOpen(false)}>
              {editingRequirementId ? "Save Changes" : "Create Requirement"}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4">
            <Input
              label="Requirement Title"
              required
              value={formState.title}
              onChange={(event) =>
                setFormState((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Enter requirement title"
            />
            <Textarea
              label="Description"
              value={formState.description}
              onChange={(event) =>
                setFormState((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Describe the requirement"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Business Value / Strategic Rating"
                required
                value={formState.businessValue}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    businessValue: event.target.value,
                    strategicRating: event.target.value,
                  }))
                }
                options={businessValueOptions}
              />
              <Input
                label="Complexity / Estimated Effort (Weeks)"
                required
                type="number"
                min="1"
                value={formState.complexityWeeks}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, complexityWeeks: event.target.value }))
                }
              />
              <Select
                label="Customer Importance (MoSCoW priority rating)"
                required
                value={formState.customerImportance}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, customerImportance: event.target.value }))
                }
                options={customerImportanceOptions}
              />
              <Input
                label="Category Divisor"
                required
                type="number"
                min="1"
                value={formState.categoryDivisor}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, categoryDivisor: event.target.value }))
                }
              />
              <Select
                label="Theme Category"
                required
                value={formState.themeCategory}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, themeCategory: event.target.value }))
                }
                options={themeCategoryOptions}
              />
              <Select
                label="Category"
                required
                value={formState.category}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, category: event.target.value }))
                }
                options={categoryOptions}
              />
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200 bg-slate-50/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AI Prediction Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Predicted Priority</span>
                  <Badge variant={getPriorityBadgeVariant(formState.predictedPriority) as never}>
                    {formState.predictedPriority.charAt(0).toUpperCase() +
                      formState.predictedPriority.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Prediction Confidence</span>
                  <span className="text-sm font-medium text-slate-900">
                    {formState.predictionConfidence}%
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-2">
                    AI Explanation / SHAP rationale
                  </p>
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                    {formState.aiExplanation}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4 text-sm text-amber-900">
                The form now includes the full model input set so backend scoring can be wired without adding new UI fields later.
              </CardContent>
            </Card>
          </div>
        </div>
      </Modal>
    </AuthenticatedLayout>
  );
}
