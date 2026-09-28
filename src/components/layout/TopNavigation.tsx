"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Bell,
  Plus,
  Calendar,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Command,
} from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

interface TopNavigationProps {
  isSidebarCollapsed: boolean;
}

interface MeState {
  displayName: string;
  email: string;
  initials: string;
  organizationName: string | null;
}

/**
 * Loads the authenticated caller's profile + organization context from the
 * server-authenticated GET /api/me (same-origin cookies, no client-supplied
 * identity). The browser never chooses an organization id: the server
 * derives membership from auth.uid() and returns the primary organization.
 * No hardcoded demo names/organizations are rendered — while loading,
 * neutral placeholders are shown.
 */
function useMe(): { me: MeState | null; isLoading: boolean } {
  const [me, setMe] = React.useState<MeState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/me", {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("success" in payload) ||
          (payload as { success: unknown }).success !== true ||
          !("data" in payload) ||
          typeof (payload as { data?: unknown }).data !== "object" ||
          (payload as { data?: unknown }).data === null
        ) {
          return;
        }
        const data = (payload as { data: Record<string, unknown> }).data;
        const user =
          typeof data.user === "object" && data.user !== null
            ? (data.user as Record<string, unknown>)
            : {};
        const primaryOrg =
          typeof data.primaryOrganization === "object" &&
          data.primaryOrganization !== null
            ? (data.primaryOrganization as Record<string, unknown>)
            : null;
        const displayName =
          typeof user.displayName === "string" && user.displayName.length > 0
            ? user.displayName
            : "User";
        const email = typeof user.email === "string" ? user.email : "";
        const initials =
          typeof user.avatarInitials === "string" &&
          user.avatarInitials.length > 0
            ? user.avatarInitials
            : displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join("") || "U";
        if (cancelled) return;
        setMe({
          displayName,
          email,
          initials,
          organizationName:
            primaryOrg !== null &&
            typeof primaryOrg.name === "string" &&
            primaryOrg.name.length > 0
              ? primaryOrg.name
              : null,
        });
      } catch {
        // Fail-closed display: keep neutral placeholders, never demo data.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { me, isLoading };
}

export function TopNavigation({ isSidebarCollapsed }: TopNavigationProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showCommandPalette, setShowCommandPalette] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const { me, isLoading: isMeLoading } = useMe();

  const handleSignOut = React.useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }, [router, isSigningOut]);

  // Keyboard shortcut for command palette
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 right-0 h-16 bg-white border-b border-slate-200 z-30 transition-all duration-300",
          isSidebarCollapsed ? "left-16" : "left-64"
        )}
      >
        <div className="h-full flex items-center justify-between px-6">
          {/* Left: Breadcrumb area - organization of the authenticated user */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center text-sm text-slate-500">
              <span>Organization</span>
              <span className="mx-2">/</span>
              <span className="text-slate-900 font-medium">
                {isMeLoading
                  ? "Loading…"
                  : (me?.organizationName ?? "No organization")}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Global Search */}
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
              <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-white border border-slate-200 rounded">
                ⌘K
              </kbd>
            </button>

            {/* Quick Create */}
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create</span>
                </button>
              }
              align="right"
            >
              <DropdownItem icon={<Plus className="h-4 w-4" />}>
                New Project
              </DropdownItem>
              <DropdownItem icon={<Plus className="h-4 w-4" />}>
                New Requirement
              </DropdownItem>
              <DropdownItem icon={<Plus className="h-4 w-4" />}>
                New Sprint
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Plus className="h-4 w-4" />}>
                Upload Document
              </DropdownItem>
              <DropdownItem icon={<Plus className="h-4 w-4" />}>
                Invite Member
              </DropdownItem>
            </Dropdown>

            {/* Calendar */}
            <button
              type="button"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Calendar className="h-5 w-5" />
            </button>

            {/* Notifications */}
            <button
              type="button"
              className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-rose-500 rounded-full" />
            </button>

            {/* Profile */}
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
                    {me !== null ? (
                      <span className="text-xs font-medium text-slate-700">
                        {me.initials}
                      </span>
                    ) : (
                      <User className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
              }
              align="right"
            >
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">
                  {isMeLoading ? "Loading…" : (me?.displayName ?? "User")}
                </p>
                <p className="text-xs text-slate-500">
                  {isMeLoading ? "…" : (me?.email ?? "")}
                </p>
              </div>
              <DropdownItem icon={<User className="h-4 w-4" />}>
                Profile
              </DropdownItem>
              <DropdownItem icon={<Settings className="h-4 w-4" />}>
                Settings
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                icon={<LogOut className="h-4 w-4" />}
                danger
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? "Signing Out…" : "Sign Out"}
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* Command Palette Modal */}
      {showCommandPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search projects, requirements, tasks..."
                  className="flex-1 text-lg outline-none placeholder:text-slate-400"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <kbd className="px-2 py-1 text-xs bg-slate-100 border border-slate-200 rounded">
                  ESC
                </kbd>
              </div>
            </div>
            <div className="p-2 max-h-[400px] overflow-y-auto">
              <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">
                Recent Searches
              </div>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left">
                <Command className="h-4 w-4 text-slate-400" />
                Authentication requirements
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left">
                <Command className="h-4 w-4 text-slate-400" />
                Sprint 23 report
              </button>
              <div className="px-3 py-2 mt-2 text-xs font-semibold text-slate-400 uppercase">
                Suggestions
              </div>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left">
                <span className="text-slate-400">#</span>
                Go to Project Dashboard
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg text-left">
                <span className="text-slate-400">@</span>
                View My Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
