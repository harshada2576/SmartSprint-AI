"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusChip } from "@/components/ui/StatusChip";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
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
  MoreHorizontal,
  FolderKanban,
  Calendar,
  Users,
  ArrowUpDown,
} from "lucide-react";

const projects = [
  {
    id: 1,
    name: "E-Commerce Platform Redesign",
    code: "ECOM-2025",
    client: "RetailCorp Inc.",
    manager: "John Smith",
    status: "active",
    progress: 65,
    sprint: "Sprint 4",
    endDate: "2025-09-15",
    team: 8,
    priority: "high",
  },
  {
    id: 2,
    name: "Mobile Banking App",
    code: "BANK-2025",
    client: "FinanceFirst Bank",
    manager: "Sarah Chen",
    status: "active",
    progress: 42,
    sprint: "Sprint 2",
    endDate: "2025-10-30",
    team: 12,
    priority: "high",
  },
  {
    id: 3,
    name: "Healthcare Portal",
    code: "HEALTH-2025",
    client: "MedCare Systems",
    manager: "Mike Johnson",
    status: "pending",
    progress: 15,
    sprint: "-",
    endDate: "2025-12-01",
    team: 6,
    priority: "medium",
  },
  {
    id: 4,
    name: "CRM Integration",
    code: "CRM-2025",
    client: "SalesPro LLC",
    manager: "Emily Davis",
    status: "completed",
    progress: 100,
    sprint: "Sprint 8",
    endDate: "2025-06-30",
    team: 5,
    priority: "low",
  },
  {
    id: 5,
    name: "Data Analytics Dashboard",
    code: "ANALYTICS-2025",
    client: "TechCorp Solutions",
    manager: "David Wilson",
    status: "active",
    progress: 78,
    sprint: "Sprint 6",
    endDate: "2025-08-20",
    team: 7,
    priority: "medium",
  },
  {
    id: 6,
    name: "Inventory Management System",
    code: "INV-2025",
    client: "Logistics Pro",
    manager: "Lisa Anderson",
    status: "blocked",
    progress: 35,
    sprint: "Sprint 3",
    endDate: "2025-11-15",
    team: 4,
    priority: "high",
  },
];

const filters = [
  { label: "All Projects", value: "all", count: 12 },
  { label: "Active", value: "active", count: 7 },
  { label: "Pending", value: "pending", count: 2 },
  { label: "Completed", value: "completed", count: 2 },
  { label: "Blocked", value: "blocked", count: 1 },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredProjects = projects.filter((project) => {
    const matchesFilter =
      activeFilter === "all" || project.status === activeFilter;
    const matchesSearch =
      searchQuery === "" ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Projects"
        description="Manage all your software projects"
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "Projects" }]}
        primaryAction={{
          label: "Create Project",
          onClick: () => router.push("/projects/create"),
        }}
        secondaryActions={[
          {
            label: "Import",
            onClick: () => {},
          },
          {
            label: "Export",
            onClick: () => {},
          },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === filter.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {filter.label}
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                  activeFilter === filter.value
                    ? "bg-white/20"
                    : "bg-slate-100"
                }`}
              >
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <SearchInput
          placeholder="Search projects by name, client, or code..."
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

      {/* Projects Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">
                        {project.name}
                      </p>
                      <p className="text-xs text-slate-500">{project.code}</p>
                    </div>
                  </TableCell>
                  <TableCell>{project.client}</TableCell>
                  <TableCell>{project.manager}</TableCell>
                  <TableCell>
                    <StatusChip status={project.status} size="sm" />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        project.priority === "high"
                          ? "danger"
                          : project.priority === "medium"
                          ? "warning"
                          : "success"
                      }
                      size="sm"
                    >
                      {project.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 w-28">
                      <Progress value={project.progress} size="sm" />
                      <span className="text-xs text-slate-500 w-8">
                        {project.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm">{project.team}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm">{project.endDate}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
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
    </AuthenticatedLayout>
  );
}
