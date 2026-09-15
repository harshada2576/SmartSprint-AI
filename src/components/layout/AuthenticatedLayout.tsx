"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { cn } from "@/lib/utils";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Load sidebar state from localStorage on mount.
  // NOTE: intentionally a mount effect, not a lazy useState initializer —
  // reading localStorage during render would produce different server vs
  // client first-render output (hydration mismatch). The synchronous setState
  // below runs once on mount and is hydration-safe.
  React.useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see NOTE above
      setIsSidebarCollapsed(saved === "true");
    }
  }, []);

  // Save sidebar state when it changes
  const toggleSidebar = React.useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem("sidebar-collapsed", String(newValue));
      return newValue;
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
      <TopNavigation isSidebarCollapsed={isSidebarCollapsed} />

      <main
        className={cn(
          "pt-16 min-h-screen transition-all duration-300",
          isSidebarCollapsed ? "pl-16" : "pl-64"
        )}
      >
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
