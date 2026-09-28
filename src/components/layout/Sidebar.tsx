"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/auth/use-user";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  ListTodo,
  CalendarDays,
  Users,
  Settings,
  Bell,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  Target,
  Layers,
  Zap,
  Bot,
  AlertTriangle,
  Building,
  Activity,
  ShieldAlert,
  UserCheck,
} from "lucide-react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const PM_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Requirements", href: "/requirements", icon: FileText },
  { label: "Backlog", href: "/backlog", icon: ListTodo },
  { label: "Sprint Planning", href: "/sprint-planning", icon: CalendarDays },
  { label: "Sprint Board", href: "/sprint-board", icon: Layers },
  { label: "Team", href: "/team", icon: Users },
  { label: "Risks", href: "/risks", icon: AlertTriangle },
  { label: "AI Assistant", href: "/ai-assistant", icon: Bot },
  { label: "Monitoring", href: "/monitoring", icon: Target },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Notifications", href: "/notifications", icon: Bell },
];

const DEVELOPER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Tasks", href: "/execution", icon: Zap },
  { label: "My Sprint", href: "/sprint-board", icon: CalendarDays },
  { label: "Assigned Projects", href: "/projects", icon: FolderKanban },
  { label: "Sprint Board", href: "/sprint-board", icon: Layers },
  { label: "AI Assistant", href: "/ai-assistant", icon: Bot },
  { label: "Notifications", href: "/notifications", icon: Bell },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Organizations", href: "/admin/organizations", icon: Building },
  { label: "System Activity", href: "/admin/activity", icon: Activity },
  { label: "Audit Logs", href: "/admin/audit", icon: ShieldAlert },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { role, isLoading, organization } = useUser();

  const navItems = React.useMemo(() => {
    if (role === "ADMIN") return ADMIN_NAV_ITEMS;
    if (role === "DEVELOPER") return DEVELOPER_NAV_ITEMS;
    // Default to Project Manager
    return PM_NAV_ITEMS;
  }, [role]);

  const roleLabel = React.useMemo(() => {
    if (isLoading) return "Loading...";
    if (role === "ADMIN") return "Administrator";
    if (role === "DEVELOPER") return "Developer";
    return "Project Manager";
  }, [role, isLoading]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-white border-r border-slate-200 z-40 transition-all duration-300 flex flex-col",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "h-16 flex items-center border-b border-slate-200 px-4 justify-between",
          isCollapsed && "justify-center px-2"
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-slate-900 text-sm leading-tight">
                SmartSprint AI
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {organization?.name ?? "Workspace"}
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Role Indicator */}
      {!isCollapsed && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <Link
              key={item.label + item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                isCollapsed && "justify-center px-2"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Toggle Button */}
      <div className="p-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm",
            isCollapsed && "justify-center w-full"
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
