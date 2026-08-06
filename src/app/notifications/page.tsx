"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Bell,
  CheckSquare,
  Calendar,
  DollarSign,
  FileText,
  Settings,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  Filter,
  Search,
  Trash2,
  Check,
} from "lucide-react";

const notifications = [
  {
    id: 1,
    type: "sprint",
    title: "Sprint 4 ends tomorrow",
    description: "You have 3 tasks remaining in the current sprint",
    time: "2 hours ago",
    priority: "high",
    read: false,
    action: "Open Sprint",
  },
  {
    id: 2,
    type: "task",
    title: "TASK-107 assigned to you",
    description: "Implement product search functionality",
    time: "4 hours ago",
    priority: "medium",
    read: false,
    action: "View Task",
  },
  {
    id: 3,
    type: "approval",
    title: "Approval required",
    description: "Sprint 4 scope change request from John Smith",
    time: "6 hours ago",
    priority: "high",
    read: true,
    action: "Review",
  },
  {
    id: 4,
    type: "document",
    title: "Document updated",
    description: "SRS v2.1 has been uploaded by Sarah Chen",
    time: "Yesterday",
    priority: "low",
    read: true,
    action: "View Document",
  },
  {
    id: 5,
    type: "system",
    title: "AI Analysis Complete",
    description: "Requirements analysis completed for E-Commerce Platform",
    time: "Yesterday",
    priority: "medium",
    read: true,
    action: "View Results",
  },
  {
    id: 6,
    type: "budget",
    title: "Budget threshold alert",
    description: "Development budget at 80% of allocated amount",
    time: "2 days ago",
    priority: "high",
    read: true,
    action: "View Budget",
  },
];

const getIcon = (type: string) => {
  switch (type) {
    case "task":
      return <CheckSquare className="h-5 w-5 text-blue-500" />;
    case "sprint":
      return <Calendar className="h-5 w-5 text-violet-500" />;
    case "approval":
      return <CheckCircle className="h-5 w-5 text-amber-500" />;
    case "document":
      return <FileText className="h-5 w-5 text-emerald-500" />;
    case "budget":
      return <DollarSign className="h-5 w-5 text-rose-500" />;
    case "system":
      return <Settings className="h-5 w-5 text-slate-500" />;
    default:
      return <Info className="h-5 w-5 text-slate-500" />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "high":
      return "bg-rose-100 text-rose-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    case "low":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("all");

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.read;
    return n.type === activeTab;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Notification Center"
        description="Stay updated on all project activities"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Notifications" },
        ]}
        primaryAction={{
          label: "Mark All Read",
          onClick: () => {},
        }}
      />

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "all"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Bell className="h-4 w-4" />
                    All Notifications
                  </span>
                  <Badge size="sm">{notifications.length}</Badge>
                </button>
                <button
                  onClick={() => setActiveTab("unread")}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "unread"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4" />
                    Unread
                  </span>
                  {unreadCount > 0 && (
                    <Badge variant="danger" size="sm">
                      {unreadCount}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("task")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "task"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <CheckSquare className="h-4 w-4" />
                  Tasks
                </button>
                <button
                  onClick={() => setActiveTab("sprint")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "sprint"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  Sprints
                </button>
                <button
                  onClick={() => setActiveTab("approval")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "approval"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  Approvals
                </button>
                <button
                  onClick={() => setActiveTab("document")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "document"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Documents
                </button>
                <button
                  onClick={() => setActiveTab("system")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    activeTab === "system"
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  System
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-base">
                {activeTab === "all"
                  ? "All Notifications"
                  : activeTab === "unread"
                  ? "Unread Notifications"
                  : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Notifications`}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" leftIcon={<Check className="h-4 w-4" />}>
                  Mark Read
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-4 w-4" />}>
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors ${
                      !notification.read ? "bg-blue-50/30" : ""
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">
                            {notification.title}
                          </p>
                          <p className="text-sm text-slate-600 mt-0.5">
                            {notification.description}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400">
                              {notification.time}
                            </span>
                            <Badge
                              className={getPriorityColor(notification.priority)}
                              size="sm"
                            >
                              {notification.priority}
                            </Badge>
                          </div>
                        </div>
                        <Button variant="secondary" size="sm">
                          {notification.action}
                        </Button>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
