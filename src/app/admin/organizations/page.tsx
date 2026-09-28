"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Building, Globe, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        const json = await res.json();
        if (json.success && json.data?.organizations) {
          setOrgs(json.data.organizations);
        }
      } catch (err) {
        console.error("Failed to load organizations:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Organizations Management"
        description="Multi-tenant workspace partitions and organizational boundaries"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orgs.map((org) => (
          <Card key={org.id} className="border-slate-200">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
                {org.name?.[0] ?? "O"}
              </div>
              <div>
                <CardTitle className="text-base">{org.name}</CardTitle>
                <CardDescription className="font-mono text-xs">{org.slug}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="flex justify-between items-center text-xs text-slate-500 py-1 border-t border-slate-100">
                <span>Tenant ID</span>
                <span className="font-mono text-[11px] text-slate-700">{org.id.slice(0, 13)}...</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500 py-1 border-t border-slate-100">
                <span>Isolation Mode</span>
                <Badge variant="outline">RLS Multi-Tenant</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AuthenticatedLayout>
  );
}
