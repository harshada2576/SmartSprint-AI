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
  DollarSign,
  FileText,
  Scale,
  CheckSquare,
  Receipt,
  ShoppingCart,
  AlertTriangle,
  GitPullRequest,
  Plus,
  Filter,
  Search,
  Download,
  MoreHorizontal,
} from "lucide-react";

const budgetItems = [
  { id: 1, category: "Development", allocated: 120000, spent: 95000, remaining: 25000, status: "ontrack" },
  { id: 2, category: "Design", allocated: 30000, spent: 25000, remaining: 5000, status: "ontrack" },
  { id: 3, category: "Testing", allocated: 25000, spent: 15000, remaining: 10000, status: "ontrack" },
  { id: 4, category: "Infrastructure", allocated: 25000, spent: 10000, remaining: 15000, status: "ontrack" },
];

const contracts = [
  { id: 1, name: "Master Service Agreement", vendor: "TechCorp Solutions", value: 150000, status: "active", expiry: "2025-12-31" },
  { id: 2, name: "Software License Agreement", vendor: "CloudPlatform Inc", value: 25000, status: "active", expiry: "2026-06-30" },
  { id: 3, name: "Consulting Agreement", vendor: "Agile Experts LLC", value: 50000, status: "pending", expiry: "-" },
];

const approvals = [
  { id: 1, title: "Sprint 4 Scope Change", requester: "John Smith", type: "scope", status: "pending", requested: "2025-07-20" },
  { id: 2, title: "Budget Increase - Development", requester: "Sarah Chen", type: "budget", status: "approved", requested: "2025-07-18" },
  { id: 3, title: "Vendor Selection - Analytics", requester: "Mike Johnson", type: "vendor", status: "rejected", requested: "2025-07-15" },
];

const risks = [
  { id: 1, title: "Payment API Integration Delay", probability: "high", impact: "high", owner: "John Smith", mitigation: "Contact vendor for expedited support" },
  { id: 2, title: "Key Developer Availability", probability: "medium", impact: "high", owner: "Sarah Chen", mitigation: "Cross-train team members" },
  { id: 3, title: "Third-party Service Outage", probability: "low", impact: "medium", owner: "Mike Johnson", mitigation: "Implement fallback mechanisms" },
];

const changeRequests = [
  { id: "CR-001", title: "Add social login options", type: "feature", impact: "medium", status: "approved", requester: "Product Team", date: "2025-07-15" },
  { id: "CR-002", title: "Update payment gateway", type: "technical", impact: "high", status: "pending", requester: "Engineering", date: "2025-07-18" },
  { id: "CR-003", title: "Extend API rate limits", type: "technical", impact: "low", status: "rejected", requester: "DevOps", date: "2025-07-12" },
];

export default function GovernancePage() {
  const router = useRouter();

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Governance Center"
        description="Manage approvals, contracts, budgets, and compliance"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Governance" },
        ]}
      />

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
                <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
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
                  {budgetItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-900">
                        {item.category}
                      </TableCell>
                      <TableCell>${item.allocated.toLocaleString()}</TableCell>
                      <TableCell>${item.spent.toLocaleString()}</TableCell>
                      <TableCell>${item.remaining.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="success" size="sm">
                          On Track
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contracts</CardTitle>
              <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                Add Contract
              </Button>
            </CardHeader>
            <CardContent className="p-0">
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
                  {contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium text-slate-900">
                        {contract.name}
                      </TableCell>
                      <TableCell>{contract.vendor}</TableCell>
                      <TableCell>${contract.value.toLocaleString()}</TableCell>
                      <TableCell>
                        <StatusChip status={contract.status} size="sm" />
                      </TableCell>
                      <TableCell>{contract.expiry}</TableCell>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((approval) => (
                    <TableRow key={approval.id}>
                      <TableCell className="font-medium text-slate-900">
                        {approval.title}
                      </TableCell>
                      <TableCell>{approval.requester}</TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm">
                          {approval.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={approval.status} size="sm" />
                      </TableCell>
                      <TableCell>{approval.requested}</TableCell>
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
              <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
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
                  {risks.map((risk) => (
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
                      <TableCell>{risk.owner}</TableCell>
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
              <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                New Request
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requester</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeRequests.map((cr) => (
                    <TableRow key={cr.id}>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {cr.id}
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
                      <TableCell>{cr.requester}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
