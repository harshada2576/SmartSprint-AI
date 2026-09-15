"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
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
  Check,
  Trash2,
} from "lucide-react";
import {
  ApiError,
  buildQuery,
  normalizeNotification,
  patchJson,
  useCollection,
  type NotificationItem,
} from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 20;

type TabValue = "all" | "unread" | "task" | "sprint" | "approval" | "document" | "system";

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

// Default action labels per notification type (UI copy; the API may supply
// its own `action_label` per row, which takes precedence).
const DEFAULT_ACTION_BY_TYPE: Record<string, string> = {
  task: "View Task",
  sprint: "Open Sprint",
  approval: "Review",
  document: "View Document",
  system: "View Results",
  budget: "View Budget",
};

function formatTime(value: string): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return formatRelativeTime(value);
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = React.useState<TabValue>("all");
  const [page, setPage] = React.useState(1);
  // Local read-state overrides applied optimistically after PATCH succeeds.
  const [readOverrides, setReadOverrides] = React.useState<Record<string, boolean>>({});
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);

  const query = React.useMemo(() => {
    if (activeTab === "all") return buildQuery({ page, pageSize: PAGE_SIZE });
    if (activeTab === "unread")
      return buildQuery({ read: "unread", page, pageSize: PAGE_SIZE });
    return buildQuery({ type: activeTab, page, pageSize: PAGE_SIZE });
  }, [activeTab, page]);

  const { items, pagination, meta, error, isLoading, retry } =
    useCollection<NotificationItem>("/api/notifications", normalizeNotification, query);

  // Unfiltered total for the "All" badge (cheap pageSize=1 probe).
  const totalsQuery = React.useMemo(
    () => buildQuery({ page: 1, pageSize: 1 }),
    [],
  );
  const { pagination: totalsPagination, retry: retryTotals } =
    useCollection<NotificationItem>(
      "/api/notifications",
      normalizeNotification,
      totalsQuery,
    );

  const displayed = items.map((item) => ({
    ...item,
    read: readOverrides[item.id] ?? item.read,
  }));

  // Server-reported global unread count, adjusted for optimistic overrides.
  const metaUnread =
    typeof meta.unreadCount === "number" ? meta.unreadCount : null;
  const optimisticNewlyRead = items.filter(
    (item) => !item.read && readOverrides[item.id] === true,
  ).length;
  const unreadCount =
    metaUnread !== null
      ? Math.max(metaUnread - optimisticNewlyRead, 0)
      : displayed.filter((item) => !item.read).length;

  const showLoading = isLoading && items.length === 0;

  const selectTab = (tab: TabValue) => {
    setActiveTab(tab);
    setPage(1);
    setMutationError(null);
  };

  const markOneRead = React.useCallback(async (id: string) => {
    setMutationError(null);
    setReadOverrides((current) => ({ ...current, [id]: true }));
    try {
      await patchJson("/api/notifications", { id, read: true }, normalizeNotification, {
        fallback: "Could not mark the notification as read",
      });
      retryTotals();
    } catch (mutationFailure: unknown) {
      setReadOverrides((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setMutationError(
        mutationFailure instanceof ApiError
          ? mutationFailure.message
          : "Could not mark the notification as read.",
      );
    }
  }, [retryTotals]);

  const markVisibleRead = React.useCallback(async () => {
    const unread = displayed.filter((item) => !item.read);
    if (unread.length === 0) return;
    setMutationError(null);
    for (const item of unread) {
      try {
        await patchJson(
          "/api/notifications",
          { id: item.id, read: true },
          normalizeNotification,
          { fallback: "Could not mark notifications as read" },
        );
        setReadOverrides((current) => ({ ...current, [item.id]: true }));
      } catch (mutationFailure: unknown) {
        setMutationError(
          mutationFailure instanceof ApiError
            ? mutationFailure.message
            : "Could not mark notifications as read.",
        );
        break;
      }
    }
    retryTotals();
  }, [displayed, retryTotals]);

  const markAllRead = React.useCallback(async () => {
    setMutationError(null);
    setIsMarkingAll(true);
    try {
      await patchJson("/api/notifications", { markAllRead: true }, normalizeNotification, {
        fallback: "Could not mark all notifications as read",
      });
      setReadOverrides({});
      retry();
      retryTotals();
    } catch (mutationFailure: unknown) {
      setMutationError(
        mutationFailure instanceof ApiError
          ? mutationFailure.message
          : "Could not mark all notifications as read.",
      );
    } finally {
      setIsMarkingAll(false);
    }
  }, [retry, retryTotals]);

  const sidebarButton = (tab: TabValue, label: React.ReactNode, badge?: React.ReactNode) => (
    <button
      onClick={() => selectTab(tab)}
      className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
        activeTab === tab
          ? "bg-slate-50 text-slate-900 font-medium"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="flex items-center gap-3">{label}</span>
      {badge}
    </button>
  );

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
          label: isMarkingAll ? "Marking…" : "Mark All Read",
          onClick: () => {
            void markAllRead();
          },
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
                {sidebarButton(
                  "all",
                  <>
                    <Bell className="h-4 w-4" />
                    All Notifications
                  </>,
                  <Badge size="sm">{totalsPagination.total}</Badge>,
                )}
                {sidebarButton(
                  "unread",
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    Unread
                  </>,
                  unreadCount > 0 ? (
                    <Badge variant="danger" size="sm">
                      {unreadCount}
                    </Badge>
                  ) : undefined,
                )}
                {sidebarButton(
                  "task",
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Tasks
                  </>,
                )}
                {sidebarButton(
                  "sprint",
                  <>
                    <Calendar className="h-4 w-4" />
                    Sprints
                  </>,
                )}
                {sidebarButton(
                  "approval",
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Approvals
                  </>,
                )}
                {sidebarButton(
                  "document",
                  <>
                    <FileText className="h-4 w-4" />
                    Documents
                  </>,
                )}
                {sidebarButton(
                  "system",
                  <>
                    <Settings className="h-4 w-4" />
                    System
                  </>,
                )}
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
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Check className="h-4 w-4" />}
                  onClick={() => {
                    void markVisibleRead();
                  }}
                >
                  Mark Read
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-4 w-4" />}>
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {mutationError !== null ? (
                <p className="px-4 py-3 text-sm text-rose-700 bg-rose-50 border-y border-rose-100">
                  {mutationError}
                </p>
              ) : null}
              {showLoading ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <div key={index} className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error !== null && items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Bell}
                    title="Couldn't load notifications"
                    description={error.message}
                    action={{ label: "Try again", onClick: retry }}
                  />
                </div>
              ) : displayed.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Bell}
                    title="No notifications"
                    description={
                      activeTab === "unread"
                        ? "You're all caught up. New notifications will show up here."
                        : "Notifications for your work will show up here."
                    }
                  />
                </div>
              ) : (
              <div className="divide-y divide-slate-100">
                {displayed.map((notification) => (
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
                          {notification.description ? (
                            <p className="text-sm text-slate-600 mt-0.5">
                              {notification.description}
                            </p>
                          ) : null}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400">
                              {formatTime(notification.createdAt)}
                            </span>
                            <Badge
                              className={getPriorityColor(notification.priority)}
                              size="sm"
                            >
                              {notification.priority}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void markOneRead(notification.id);
                          }}
                        >
                          {notification.actionLabel ??
                            DEFAULT_ACTION_BY_TYPE[notification.type] ??
                            "View"}
                        </Button>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                    )}
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>

          {!showLoading && error === null && pagination.total > 0 ? (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{" "}
                {pagination.total} notification{pagination.total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      pagination.totalPages > 0
                        ? Math.min(current + 1, pagination.totalPages)
                        : current + 1,
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
