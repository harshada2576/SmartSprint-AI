"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/Accordion";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Building,
  Calendar,
  Users,
  FileText,
  Briefcase,
} from "lucide-react";

export default function CreateProjectPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("general");

  return (
    <AuthenticatedLayout>
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/projects")}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </button>

      <PageHeader
        title="Create Project"
        description="Set up a new project with all required details"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: "Create" },
        ]}
        primaryAction={{
          label: "Create Project",
          onClick: () => router.push("/projects/1"),
        }}
        secondaryActions={[
          {
            label: "Save Draft",
            onClick: () => {},
          },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>
                Basic project details and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Project Name" placeholder="E-Commerce Platform Redesign" required />
                <Input label="Project Code" placeholder="ECOM-2025" required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Client" placeholder="RetailCorp Inc." />
                <Select
                  label="Industry"
                  options={[
                    { value: "", label: "Select industry" },
                    { value: "tech", label: "Technology" },
                    { value: "finance", label: "Finance" },
                    { value: "healthcare", label: "Healthcare" },
                    { value: "retail", label: "Retail" },
                    { value: "manufacturing", label: "Manufacturing" },
                  ]}
                />
              </div>
              <Textarea
                label="Project Description"
                placeholder="Describe the project objectives and scope..."
                rows={4}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Methodology"
                  options={[
                    { value: "scrum", label: "Scrum" },
                    { value: "kanban", label: "Kanban" },
                    { value: "waterfall", label: "Waterfall" },
                    { value: "hybrid", label: "Hybrid" },
                  ]}
                  defaultValue="scrum"
                />
                <Select
                  label="Priority"
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                    { value: "critical", label: "Critical" },
                  ]}
                  defaultValue="high"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>
                Define business objectives and project scope
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Textarea
                label="Business Objectives"
                placeholder="What business goals will this project achieve?"
                rows={3}
              />
              <Textarea
                label="Project Scope"
                placeholder="Define what is included in this project..."
                rows={3}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Textarea
                  label="In Scope"
                  placeholder="List items that are in scope..."
                  rows={4}
                />
                <Textarea
                  label="Out of Scope"
                  placeholder="List items that are out of scope..."
                  rows={4}
                />
              </div>
              <Textarea
                label="Success Criteria"
                placeholder="How will we measure project success?"
                rows={3}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Set project schedule and milestones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Start Date" type="date" />
                <Input label="Planned End Date" type="date" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-3">
                  Milestones
                </label>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input placeholder="Milestone name" className="flex-1" />
                    <Input type="date" className="w-40" />
                    <Button variant="ghost" size="sm">
                      Remove
                    </Button>
                  </div>
                  <Button variant="secondary" size="sm">
                    Add Milestone
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <CardDescription>
                Define project budget and cost breakdown
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <Input label="Estimated Budget" type="number" placeholder="200000" />
                <Input label="Approved Budget" type="number" placeholder="200000" />
                <Select
                  label="Currency"
                  options={[
                    { value: "USD", label: "USD - US Dollar" },
                    { value: "EUR", label: "EUR - Euro" },
                    { value: "GBP", label: "GBP - British Pound" },
                  ]}
                  defaultValue="USD"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-3">
                  Cost Categories
                </label>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input placeholder="Category name" className="flex-1" />
                    <Input type="number" placeholder="Amount" className="w-32" />
                    <Button variant="ghost" size="sm">
                      Remove
                    </Button>
                  </div>
                  <Button variant="secondary" size="sm">
                    Add Category
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>
                Assign project team members and roles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Project Manager" placeholder="Select project manager" />
                <Input label="Product Owner" placeholder="Select product owner" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-3">
                  Team Members
                </label>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input placeholder="Team member name" className="flex-1" />
                    <Select
                      options={[
                        { value: "", label: "Select role" },
                        { value: "developer", label: "Developer" },
                        { value: "designer", label: "Designer" },
                        { value: "qa", label: "QA Engineer" },
                        { value: "analyst", label: "Business Analyst" },
                      ]}
                      className="w-40"
                    />
                    <Button variant="ghost" size="sm">
                      Remove
                    </Button>
                  </div>
                  <Button variant="secondary" size="sm">
                    Add Team Member
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>
                Review all project information before creation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Project Name</span>
                  <span className="text-sm font-medium text-slate-900">E-Commerce Platform Redesign</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Client</span>
                  <span className="text-sm font-medium text-slate-900">RetailCorp Inc.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Methodology</span>
                  <span className="text-sm font-medium text-slate-900">Scrum</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Budget</span>
                  <span className="text-sm font-medium text-slate-900">$200,000 USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Timeline</span>
                  <span className="text-sm font-medium text-slate-900">Jan 15 - Sep 15, 2025</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <span className="text-sm text-emerald-800">
                  All required information has been provided
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
