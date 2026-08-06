"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Users,
  UserPlus,
  Mail,
  MoreHorizontal,
  Shield,
  Briefcase,
  Clock,
  Filter,
  Download,
} from "lucide-react";

const users = [
  { id: 1, name: "John Smith", email: "john@example.com", role: "Project Manager", department: "Engineering", status: "active", projects: 3, lastActive: "2 hours ago" },
  { id: 2, name: "Sarah Chen", email: "sarah@example.com", role: "Tech Lead", department: "Engineering", status: "active", projects: 2, lastActive: "5 hours ago" },
  { id: 3, name: "Mike Johnson", email: "mike@example.com", role: "Senior Developer", department: "Engineering", status: "active", projects: 3, lastActive: "1 hour ago" },
  { id: 4, name: "Emily Davis", email: "emily@example.com", role: "UI/UX Designer", department: "Design", status: "active", projects: 2, lastActive: "30 min ago" },
  { id: 5, name: "David Wilson", email: "david@example.com", role: "QA Engineer", department: "Quality Assurance", status: "active", projects: 2, lastActive: "3 hours ago" },
  { id: 6, name: "Lisa Anderson", email: "lisa@example.com", role: "Business Analyst", department: "Product", status: "inactive", projects: 1, lastActive: "2 days ago" },
];

const teams = [
  { id: 1, name: "Engineering", members: 12, lead: "Sarah Chen" },
  { id: 2, name: "Design", members: 4, lead: "Emily Davis" },
  { id: 3, name: "Quality Assurance", members: 3, lead: "David Wilson" },
  { id: 4, name: "Product", members: 2, lead: "John Smith" },
];

const invitations = [
  { id: 1, email: "alex@example.com", role: "Developer", sent: "2 days ago", status: "pending" },
  { id: 2, email: "jane@example.com", role: "Designer", sent: "1 week ago", status: "expired" },
];

const roles = [
  { id: 1, name: "Administrator", permissions: "Full Access", users: 2 },
  { id: 2, name: "Project Manager", permissions: "Project Management", users: 3 },
  { id: 3, name: "Developer", permissions: "Development Tasks", users: 8 },
  { id: 4, name: "Viewer", permissions: "Read Only", users: 5 },
];

export default function TeamPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredUsers = users.filter(
    (user) =>
      searchQuery === "" ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Team Management"
        description="Manage users, teams, and permissions"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Team" },
        ]}
        primaryAction={{
          label: "Invite Member",
          onClick: () => {},
        }}
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <SearchInput
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className="w-80"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" leftIcon={<Filter className="h-4 w-4" />}>
                  Filter
                </Button>
                <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                            {user.name.split(" ").map((n) => n[0]).join("")}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {user.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>{user.department}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "active" ? "success" : "default"}
                          size="sm"
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.projects}</TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {user.lastActive}
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
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {teams.map((team) => (
              <Card key={team.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-slate-600" />
                    </div>
                    <Badge size="sm">{team.members}</Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 mt-3">
                    {team.name}
                  </h3>
                  <p className="text-sm text-slate-500">Lead: {team.lead}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Roles & Permissions</CardTitle>
              <Button variant="secondary" size="sm" leftIcon={<Shield className="h-4 w-4" />}>
                Add Role
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium text-slate-900">
                        {role.name}
                      </TableCell>
                      <TableCell>{role.permissions}</TableCell>
                      <TableCell>
                        <Badge size="sm">{role.users}</Badge>
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
        </TabsContent>

        <TabsContent value="invitations" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pending Invitations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium text-slate-900">
                        {inv.email}
                      </TableCell>
                      <TableCell>{inv.role}</TableCell>
                      <TableCell>{inv.sent}</TableCell>
                      <TableCell>
                        <Badge
                          variant={inv.status === "pending" ? "warning" : "default"}
                          size="sm"
                        >
                          {inv.status}
                        </Badge>
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
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
