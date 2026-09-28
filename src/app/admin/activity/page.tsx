"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Activity, Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export default function AdminActivityPage() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/activity");
        const json = await res.json();
        if (json.success) {
          setLogs(json.data);
        }
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="System Activity & Operations"
        description="Chronological record of entity mutations and system events"
      />

      <Card className="border-slate-200">
        <CardContent className="p-6">
          {loading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Loading activity logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No system activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between text-xs">
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mt-0.5">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {log.userName ? log.userName : log.userEmail ?? "System"}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {log.entityType}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                          {log.action}
                        </Badge>
                      </div>
                      <p className="text-slate-600 mt-1">{log.value}</p>
                    </div>
                  </div>
                  <span className="text-slate-400 whitespace-nowrap ml-4 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {log.createdAt ? formatRelativeTime(log.createdAt) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}
