"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Sparkles,
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
  FileStack,
  Layers,
  Zap,
  ClipboardList,
} from "lucide-react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  children?: { label: string; href: string }[];
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
];

const projectNavItems: NavItem[] = [
  {
    label: "Requirements",
    href: "/requirements",
    icon: FileText,
  },
  {
    label: "AI Recommendations",
    href: "/ai-recommendations",
    icon: Sparkles,
  },
  {
    label: "Product Backlog",
    href: "/backlog",
    icon: ListTodo,
  },
  {
    label: "Sprint Planning",
    href: "/sprint-planning",
    icon: CalendarDays,
  },
  {
    label: "Sprint Board",
    href: "/sprint-board",
    icon: Layers,
  },
  {
    label: "Execution",
    href: "/execution",
    icon: Zap,
  },
];

const managementNavItems: NavItem[] = [
  { label: "Monitoring", href: "/monitoring", icon: Target },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FileStack },
  { label: "Governance", href: "/governance", icon: ClipboardList },
];

const systemNavItems: NavItem[] = [
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Team", href: "/team", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavSection({
  title,
  items,
  isCollapsed,
}: {
  title: string;
  items: NavItem[];
  isCollapsed: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      {!isCollapsed && (
        <h3 className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {title}
        </h3>
      )}
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
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
              <Icon className={cn("h-5 w-5", isCollapsed && "h-5 w-5")} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
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
          "h-16 flex items-center border-b border-slate-200 px-4",
          isCollapsed && "justify-center px-2"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <span className="font-semibold text-slate-900 text-sm">
              SmartSprint
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <NavSection
          title="Workspace"
          items={mainNavItems}
          isCollapsed={isCollapsed}
        />
        <NavSection
          title="Project"
          items={projectNavItems}
          isCollapsed={isCollapsed}
        />
        <NavSection
          title="Management"
          items={managementNavItems}
          isCollapsed={isCollapsed}
        />
        <NavSection
          title="System"
          items={systemNavItems}
          isCollapsed={isCollapsed}
        />
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
