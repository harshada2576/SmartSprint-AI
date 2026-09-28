import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/api/auth";
import {
  internalErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const THEMES = new Set(["light", "dark", "system"]);

/**
 * GET /api/settings — caller's own preferences (theme, sidebar state,
 * notification preferences). Returns defaults when no row exists yet.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { data, error } = await supabase
      .from("user_preferences")
      .select("theme,sidebar_collapsed,notification_preferences,updated_at")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return successResponse({
        theme: "light",
        sidebarCollapsed: false,
        notificationPreferences: {},
      });
    }
    return successResponse({
      theme: (data as { theme?: string }).theme ?? "light",
      sidebarCollapsed:
        (data as { sidebar_collapsed?: boolean }).sidebar_collapsed ?? false,
      notificationPreferences:
        (data as { notification_preferences?: unknown })
          .notification_preferences ?? {},
    });
  } catch (error) {
    console.error("GET /api/settings failed:", error);
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/settings — update own preferences (upsert own row; RLS
 * user_preferences_*_own policies enforce ownership).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    const patch: {
      theme?: string;
      sidebar_collapsed?: boolean;
      notification_preferences?: unknown;
    } = {};
    if (body.theme !== undefined) {
      if (typeof body.theme !== "string" || !THEMES.has(body.theme)) {
        return validationErrorResponse([
          { field: "theme", message: "theme must be light, dark, or system" },
        ]);
      }
      patch.theme = body.theme;
    }
    if (body.sidebarCollapsed !== undefined) {
      if (typeof body.sidebarCollapsed !== "boolean") {
        return validationErrorResponse([
          {
            field: "sidebarCollapsed",
            message: "sidebarCollapsed must be a boolean",
          },
        ]);
      }
      patch.sidebar_collapsed = body.sidebarCollapsed;
    }
    if (body.notificationPreferences !== undefined) {
      if (!isRecord(body.notificationPreferences)) {
        return validationErrorResponse([
          {
            field: "notificationPreferences",
            message: "notificationPreferences must be an object",
          },
        ]);
      }
      patch.notification_preferences = body.notificationPreferences;
    }
    if (Object.keys(patch).length === 0) {
      return validationErrorResponse([
        { field: "body", message: "No preference field provided" },
      ]);
    }

    const { data: existing, error: readError } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;

    if (!existing) {
      const { data: created, error: insertError } = await supabase
        .from("user_preferences")
        .insert({ user_id: user.id, ...patch })
        .select(
          "theme,sidebar_collapsed,notification_preferences,updated_at",
        )
        .single();
      if (insertError) throw insertError;
      return successResponse(toShape(created));
    }

    const { data: updated, error: updateError } = await supabase
      .from("user_preferences")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("theme,sidebar_collapsed,notification_preferences,updated_at")
      .single();
    if (updateError) throw updateError;
    return successResponse(toShape(updated));
  } catch (error) {
    console.error("PATCH /api/settings failed:", error);
    return internalErrorResponse();
  }
}

function toShape(row: unknown): {
  theme: string;
  sidebarCollapsed: boolean;
  notificationPreferences: unknown;
} {
  const record = row as {
    theme?: string;
    sidebar_collapsed?: boolean;
    notification_preferences?: unknown;
  };
  return {
    theme: record.theme ?? "light",
    sidebarCollapsed: record.sidebar_collapsed ?? false,
    notificationPreferences: record.notification_preferences ?? {},
  };
}
