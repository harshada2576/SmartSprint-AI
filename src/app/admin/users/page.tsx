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
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Users,
  UserPlus,
  Mail,
  Copy,
  Check,
  Shield,
  Search,
  AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<any[]>([]);
  const [invitations, setInvitations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"PROJECT_MANAGER" | "DEVELOPER">("DEVELOPER");
  const [inviting, setInviting] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/invitations"),
      ]);

      const [usersData, invitesData] = await Promise.all([
        usersRes.json(),
        invitesRes.json(),
      ]);

      if (usersData.success) {
        setUsers(usersData.data);
      }
      if (invitesData.success) {
        setInvitations(invitesData.data);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError(null);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setInviteError(data.error?.message ?? "Failed to create invitation");
        setInviting(false);
        return;
      }

      const fullUrl = `${window.location.origin}${data.data.inviteUrl}`;
      setCreatedInviteUrl(fullUrl);
      fetchData();
    } catch {
      setInviteError("Network error while creating invitation");
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

  const filteredUsers = users.filter((u) => {
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="User & Access Management"
        description="Administer organization members, invite new team roles, and oversee account security"
        primaryAction={{
          label: "Invite Member",
          icon: <UserPlus className="w-4 h-4" />,
          onClick: () => {
            setCreatedInviteUrl(null);
            setInviteEmail("");
            setInviteError(null);
            setIsInviteOpen(true);
          },
        }}
      />

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { value: "all", label: "All Roles" },
              { value: "ADMIN", label: "Administrators" },
              { value: "PROJECT_MANAGER", label: "Project Managers" },
              { value: "DEVELOPER", label: "Developers" },
            ]}
          />
        </div>
      </div>

      {/* Users Table */}
      <Card className="border-slate-200 mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600" />
            Active Members ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 py-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState title="No members match search" description="Try clearing your filters to see all users." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase font-semibold">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-xs">
                            {u.firstName?.[0]}
                            {u.lastName?.[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {u.firstName} {u.lastName}
                            </p>
                            {u.jobTitle && <p className="text-xs text-slate-500">{u.jobTitle}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.email}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            u.role === "ADMIN"
                              ? "default"
                              : u.role === "PROJECT_MANAGER"
                              ? "secondary"
                              : "outline"
                          }
                          className="uppercase font-semibold text-[10px]"
                        >
                          {u.role?.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {u.joinedAt ? formatDate(u.joinedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-5 w-5 text-slate-600" />
            Pending & Recent Invitations ({invitations.length})
          </CardTitle>
          <CardDescription>Invited users who have not yet accepted their role assignment</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No pending invitations.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase font-semibold">
                    <th className="py-3 px-4">Invited Email</th>
                    <th className="py-3 px-4">Target Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Invite Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">{inv.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="uppercase font-semibold text-[10px]">
                          {inv.role?.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={inv.status === "pending" ? "warning" : "success"}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {inv.expiresAt ? formatDate(inv.expiresAt) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-blue-600"
                          onClick={() => {
                            const url = `${window.location.origin}/auth/invite?token=${inv.id}`;
                            navigator.clipboard.writeText(url);
                            alert("Invitation link copied to clipboard!");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copy Link
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Team Member"
        description="Generate an invitation link with a specific role assignment"
      >
        {!createdInviteUrl ? (
          <form onSubmit={handleSendInvite} className="space-y-4 pt-2">
            {inviteError && (
              <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{inviteError}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <Input
                type="email"
                required
                placeholder="developer@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Role</label>
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                options={[
                  { value: "DEVELOPER", label: "Developer" },
                  { value: "PROJECT_MANAGER", label: "Project Manager" },
                ]}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The user will be provisioned directly into this role upon accepting the invitation.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? "Creating Invite..." : "Create Invitation"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Invitation generated for <strong>{inviteEmail}</strong> as <strong>{inviteRole}</strong>.</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Direct Invitation Link</label>
              <div className="flex gap-2">
                <Input readOnly value={createdInviteUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Share this link with the candidate. They can open it to create their credentials and activate their role.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={() => setIsInviteOpen(false)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </AuthenticatedLayout>
  );
}
