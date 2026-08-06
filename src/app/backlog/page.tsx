"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { PriorityChip, StatusChip } from "@/components/ui/StatusChip";
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
  Plus,
  Filter,
  Download,
  MoreHorizontal,
  ArrowUpDown,
  Calendar,
  User,
  Flag,
} from "lucide-react";

const backlogItems = [
  {
    id: "REQ-001",
    priority: 1,
    title: "User Authentication with Multi-Factor Authentication",
    storyPoints: 8,
    sprint: "Sprint 1",
    status: "approved",
    owner: "John Smith",
    category: "Security",
  },
  {
    id: "REQ-002",
    priority: 2,
    title: "Product Catalog Search and Filtering",
    storyPoints: 13,
    sprint: "Sprint 2",
    status: "approved",
    owner: "Sarah Chen",
    category: "Feature",
  },
  {
    id: "REQ-003",
    priority: 3,
    title: "Shopping Cart Persistence",
    storyPoints: 5,
    sprint: "Sprint 3",
    status: "approved",
    owner: "Unassigned",
    category: "Feature",
  },
  {
    id: "REQ-004",
    priority: 4,
    title: "Payment Gateway Integration",
    storyPoints: 13,
    sprint: "Sprint 2",
    status: "approved",
    owner: "Mike Johnson",
    category: "Feature",
  },
  {
    id: "REQ-005",
    priority: 5,
    title: "Order Tracking System",
    storyPoints: 8,
    sprint: "-",
    status: "approved",
    owner: "Unassigned",
    category: "Feature",
  },
  {
    id: "REQ-006",
    priority: 6,
    title: "Customer Review and Rating System",
    storyPoints: 5,
    sprint: "-",
    status: "approved",
    owner: "Unassigned",
    category: "Feature",
  },
  {
    id: "REQ-007",
    priority: 7,
    title: "Email Notification System",
    storyPoints: 3,
    sprint: "-",
    status: "approved",
    owner: "Unassigned",
    category: "Feature",
  },
  {
    id: "REQ-008",
    priority: 8,
    title: "Admin Dashboard Analytics",
    storyPoints: 8,
    sprint: "-",
    status: "approved",
    owner: "Unassigned",
    category: "Feature",
  },
];

export default function BacklogPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredItems = backlogItems.filter(
    (item) =>
      searchQuery === "" ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          onChange={setSearchQuery}
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
              {filteredItems.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/requirements/${item.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {item.priority}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-mono text-xs text-slate-400">
                        {item.id}
                      </span>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <Badge variant="outline" size="sm" className="mt-1">
                        {item.category}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {item.storyPoints} pts
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.sprint === "-" ? (
                      <span className="text-slate-400">Unassigned</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm">{item.sprint}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={item.status} size="sm" />
                  </TableCell>
                  <TableCell>
                    {item.owner === "Unassigned" ? (
                      <span className="text-slate-400 text-sm">Unassigned</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                          {item.owner.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="text-sm">{item.owner}</span>
                      </div>
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
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}
