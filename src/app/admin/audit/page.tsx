"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ShieldCheck, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function AdminAuditPage() {
  const [auditEvents, setAuditEvents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        const json = await res.json();
        if (json.success && json.data?.recentAudit) {
          setAuditEvents(json.data.recentAudit);
        }
      } catch (err) {
        console.error("Failed to load audit records:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Audit Logs & Governance Records"
        description="Formal approval requests, scope changes, and administrative audit events"
      />

      <Card className="border-slate-200">
        <CardContent className="p-6">
          {loading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Loading audit events...</p>
          ) : auditEvents.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No governance decisions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase font-semibold">
                    <th className="py-3 px-4">Event / Item</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Decision Status</th>
                    <th className="py-3 px-4">Requested Date</th>
                    <th className="py-3 px-4">Decision Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditEvents.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">{item.title}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {item.type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            item.status === "approved"
                              ? "success"
                              : item.status === "pending"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {item.requestedAt ? formatDate(item.requestedAt) : "—"}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {item.decidedAt ? formatDate(item.decidedAt) : "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}
