"use client";

import * as React from "react";
import type { MeResponse } from "@/app/api/me/route";
import type { AppRole } from "@/types/api";

export interface UserSession {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    avatarInitials: string | null;
    avatarUrl: string | null;
  } | null;
  role: AppRole | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  isLoading: boolean;
  isAdmin: boolean;
  isProjectManager: boolean;
  isDeveloper: boolean;
  isStaff: boolean;
  refetch: () => Promise<void>;
}

const UserContext = React.createContext<UserSession>({
  user: null,
  role: null,
  organization: null,
  isLoading: true,
  isAdmin: false,
  isProjectManager: false,
  isDeveloper: false,
  isStaff: false,
  refetch: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchMe = React.useCallback(async () => {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const role = data?.primaryOrganization?.role ?? null;
  const isAdmin = role === "ADMIN";
  const isProjectManager = role === "PROJECT_MANAGER";
  const isDeveloper = role === "DEVELOPER";
  const isStaff = isAdmin || isProjectManager;

  const value = React.useMemo<UserSession>(
    () => ({
      user: data?.user ?? null,
      role,
      organization: data?.primaryOrganization
        ? {
            id: data.primaryOrganization.id,
            name: data.primaryOrganization.name,
            slug: data.primaryOrganization.slug,
          }
        : null,
      isLoading,
      isAdmin,
      isProjectManager,
      isDeveloper,
      isStaff,
      refetch: fetchMe,
    }),
    [data, role, isLoading, isAdmin, isProjectManager, isDeveloper, isStaff, fetchMe]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserSession {
  return React.useContext(UserContext);
}
