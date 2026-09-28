"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Users,
  UserPlus,
  Mail,
  Copy,
  Check,
  Search,
  AlertCircle,
  Briefcase,
  Clock,
  CheckCircle2,
  Calendar,
  Loader2,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  jobTitle: string | null;
  activeTasks: number;
  completedTasks: number;
  blockedTasks: number;
  workloadHours: number;
  currentSprint: string | null;
}

export default function TeamPage() {
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [invitations, setInvitations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("ALL");

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"PROJECT_MANAGER" | "DEVELOPER">("DEVELOPER");
  const [inviting, setInviting] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fetchTeam = React.useCallback(async () => {
    try {
      setLoading(true);
      const [teamRes, invitesRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/invitations"),
      ]);

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setMembers(teamData.data || []);
      }
      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvitations(invitesData.data || []);
      }
    } catch (err) {
      console.error("Failed to load team data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      setInviteError(null);
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate invitation");
      }

      setCreatedInviteUrl(data.data.inviteUrl);
      fetchTeam();
    } catch (err: any) {
      setInviteError(err.message || "An unexpected error occurred");
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = () => {
    if (createdInviteUrl) {
      navigator.clipboard.writeText(createdInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      searchQuery === "" ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === "ALL" ||
      m.role.toUpperCase() === roleFilter.toUpperCase();

    return matchesSearch && matchesRole;
  });

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Team Directory & Workload"
        description="View real-time team assignments, active workloads, and invite members"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Team" },
        ]}
        primaryAction={{
          label: "Invite Member",
          onClick: () => {
            setInviteEmail("");
            setInviteError(null);
            setCreatedInviteUrl(null);
            setIsInviteOpen(true);
          },
        }}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="border border-border">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Members</div>
            <div className="text-2xl font-bold mt-1">{members.length}</div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Active Tasks Assigned</div>
            <div className="text-2xl font-bold mt-1">
              {members.reduce((sum, m) => sum + m.activeTasks, 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Workload Hours</div>
            <div className="text-2xl font-bold mt-1">
              {members.reduce((sum, m) => sum + m.workloadHours, 0)}h
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Pending Invitations</div>
            <div className="text-2xl font-bold mt-1">{invitations.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Team Members ({members.length})</TabsTrigger>
          <TabsTrigger value="invitations">Pending Invitations ({invitations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                aria-label="Filter by Role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-44 bg-card text-card-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Admin</option>
                <option value="PROJECT_MANAGER">Project Manager</option>
                <option value="DEVELOPER">Developer</option>
              </select>
            </div>
          </div>

          {/* Members Table */}
          <Card className="border border-border">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center p-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-base font-semibold">No team members match your criteria</p>
                  <p className="text-sm mt-1">Try resetting filters or invite a new member.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-left bg-muted/20">
                        <th className="py-3 px-4 font-medium">Member</th>
                        <th className="py-3 px-4 font-medium">Role</th>
                        <th className="py-3 px-4 font-medium text-center">Active Tasks</th>
                        <th className="py-3 px-4 font-medium text-center">Completed</th>
                        <th className="py-3 px-4 font-medium text-right">Workload (Est)</th>
                        <th className="py-3 px-4 font-medium">Current Sprint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{member.name}</div>
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                member.role.toUpperCase() === "ADMIN"
                                  ? "danger"
                                  : member.role.toUpperCase() === "PROJECT_MANAGER"
                                  ? "warning"
                                  : "info"
                              }
                              className="text-[10px]"
                            >
                              {member.role.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold">{member.activeTasks}</span>
                            {member.blockedTasks > 0 && (
                              <span className="ml-1 text-xs text-red-500 font-medium">
                                ({member.blockedTasks} blocked)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-muted-foreground">
                            {member.completedTasks}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium">
                            {member.workloadHours}h
                          </td>
                          <td className="py-3 px-4">
                            {member.currentSprint ? (
                              <Badge variant="outline" className="text-xs">
                                <Calendar className="w-3 h-3 mr-1" />
                                {member.currentSprint}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">None active</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending Invitations</CardTitle>
              <CardDescription>
                Outstanding invites for developers or managers to join the organization
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invitations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-base font-semibold">No pending invitations</p>
                  <p className="text-sm mt-1">Use the &quot;Invite Member&quot; button to invite new teammates.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-left bg-muted/20">
                        <th className="py-3 px-4 font-medium">Email</th>
                        <th className="py-3 px-4 font-medium">Role</th>
                        <th className="py-3 px-4 font-medium">Created Date</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{inv.email}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-xs">
                              {inv.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="warning" className="text-[10px]">
                              PENDING
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Team Member"
        description="Generate a secure role-based invitation link"
      >
        {createdInviteUrl ? (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 text-sm flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Invitation successfully created!</span>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Shareable Invitation URL
              </label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={createdInviteUrl} className="font-mono text-xs" />
                <Button variant="secondary" onClick={copyToClipboard}>
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Send this link to the invitee. When they open it, their account will be provisioned with the assigned role.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setIsInviteOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4 py-2">
            {inviteError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{inviteError}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Email Address
              </label>
              <Input
                type="email"
                required
                placeholder="developer@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                Assigned Role
              </label>
              <select
                aria-label="Assigned Role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="mt-1 w-full bg-card text-card-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="DEVELOPER">Developer</option>
                <option value="PROJECT_MANAGER">Project Manager</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={inviting}>
                {inviting ? "Generating..." : "Generate Invitation"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </AuthenticatedLayout>
  );
}
