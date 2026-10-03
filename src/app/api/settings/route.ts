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


function toPreferenceShape(row: unknown): {
  theme: string;
  sidebarCollapsed: boolean;
  notificationPreferences: unknown;
} {
  if (!row || typeof row !== "object") {
    return {
      theme: "light",
      sidebarCollapsed: false,
      notificationPreferences: {},
    };
  }

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

function toProfileShape(row: unknown, authEmail: string): {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  avatarInitials: string | null;
  avatarUrl: string | null;
} {
  const record = row as {
    first_name?: string;
    last_name?: string;
    email?: string;
    job_title?: string | null;
    department?: string | null;
    avatar_initials?: string | null;
    avatar_url?: string | null;
  };

  return {
    firstName: record.first_name ?? "",
    lastName: record.last_name ?? "",
    email: authEmail,
    jobTitle: record.job_title ?? "",
    department: record.department ?? "",
    avatarInitials: record.avatar_initials ?? null,
    avatarUrl: record.avatar_url ?? null,
  };
}

/**
 * GET /api/settings
 *
 * Returns:
 * - authenticated user's profile
 * - authenticated user's preferences
 *
 * Profile data always comes from the authenticated user's own
 * `public.users` row. The email displayed here comes from Supabase Auth.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;

    const { user, supabase } = auth.context;

    const [{ data: preferences, error: preferencesError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase
          .from("user_preferences")
          .select(
            "theme,sidebar_collapsed,notification_preferences,updated_at",
          )
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),

        supabase
          .from("users")
          .select(
            "first_name,last_name,email,job_title,department,avatar_initials,avatar_url",
          )
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    if (preferencesError) throw preferencesError;
    if (profileError) throw profileError;

    return successResponse({
      profile: toProfileShape(profile, user.email ?? ""),
      ...toPreferenceShape(preferences),
    });
  } catch (error) {
    console.error("GET /api/settings failed:", error);
    return internalErrorResponse();
  }
}

/**
 * PATCH /api/settings
 *
 * Updates:
 * - authenticated user's own profile fields
 * - authenticated user's own preferences
 *
 * Email is intentionally NOT editable here because authentication
 * email belongs to Supabase Auth and should not be changed by directly
 * editing public.users.email.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;

    const { user, supabase } = auth.context;

    const body = await request.json().catch(() => null);

    if (!isRecord(body)) {
      return validationErrorResponse([
        {
          field: "body",
          message: "Request body must be a JSON object",
        },
      ]);
    }

    /*
     * ------------------------------------------------------------
     * PROFILE
     * ------------------------------------------------------------
     */

    const profilePatch: {
      first_name?: string;
      last_name?: string;
      job_title?: string | null;
      department?: string | null;
      avatar_initials?: string;
    } = {};

    let hasProfilePatch = false;

    if (body.firstName !== undefined) {
      if (typeof body.firstName !== "string") {
        return validationErrorResponse([
          {
            field: "firstName",
            message: "First name must be a string",
          },
        ]);
      }

      const firstName = body.firstName.trim().slice(0, 80);

      if (!firstName) {
        return validationErrorResponse([
          {
            field: "firstName",
            message: "First name cannot be empty",
          },
        ]);
      }

      profilePatch.first_name = firstName;
      hasProfilePatch = true;
    }

    if (body.lastName !== undefined) {
      if (typeof body.lastName !== "string") {
        return validationErrorResponse([
          {
            field: "lastName",
            message: "Last name must be a string",
          },
        ]);
      }

      const lastName = body.lastName.trim().slice(0, 80);

      if (!lastName) {
        return validationErrorResponse([
          {
            field: "lastName",
            message: "Last name cannot be empty",
          },
        ]);
      }

      profilePatch.last_name = lastName;
      hasProfilePatch = true;
    }

    if (body.jobTitle !== undefined) {
      if (body.jobTitle !== null && typeof body.jobTitle !== "string") {
        return validationErrorResponse([
          {
            field: "jobTitle",
            message: "Job title must be a string or null",
          },
        ]);
      }

      profilePatch.job_title =
        body.jobTitle === null
          ? null
          : body.jobTitle.trim().slice(0, 120);

      hasProfilePatch = true;
    }

    if (body.department !== undefined) {
      if (body.department !== null && typeof body.department !== "string") {
        return validationErrorResponse([
          {
            field: "department",
            message: "Department must be a string or null",
          },
        ]);
      }

      profilePatch.department =
        body.department === null
          ? null
          : body.department.trim().slice(0, 120);

      hasProfilePatch = true;
    }

    /*
     * If first/last name changed, regenerate initials.
     */
    if (hasProfilePatch && (profilePatch.first_name !== undefined || profilePatch.last_name !== undefined)) {
      const { data: currentProfile, error: currentProfileError } = await supabase
        .from("users")
        .select("first_name,last_name")
        .eq("id", user.id)
        .single();

      if (currentProfileError) throw currentProfileError;

      const firstName =
        profilePatch.first_name ??
        (typeof currentProfile.first_name === "string"
          ? currentProfile.first_name
          : "");

      const lastName =
        profilePatch.last_name ??
        (typeof currentProfile.last_name === "string"
          ? currentProfile.last_name
          : "");

      profilePatch.avatar_initials =
        `${firstName.charAt(0)}${lastName.charAt(0)}`
          .toUpperCase()
          .trim() || "U";
    }

    if (hasProfilePatch) {
      const { error: profileUpdateError } = await supabase
        .from("users")
        .update({
          ...profilePatch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileUpdateError) throw profileUpdateError;
    }

    /*
     * ------------------------------------------------------------
     * PREFERENCES
     * ------------------------------------------------------------
     */

    const preferencePatch: {
      theme?: string;
      sidebar_collapsed?: boolean;
      notification_preferences?: unknown;
    } = {};

    if (body.theme !== undefined) {
      if (
        typeof body.theme !== "string" ||
        !THEMES.has(body.theme)
      ) {
        return validationErrorResponse([
          {
            field: "theme",
            message: "theme must be light, dark, or system",
          },
        ]);
      }

      preferencePatch.theme = body.theme;
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

      preferencePatch.sidebar_collapsed = body.sidebarCollapsed;
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

      preferencePatch.notification_preferences =
        body.notificationPreferences;
    }

    if (Object.keys(preferencePatch).length > 0) {
      const { data: existing, error: readError } = await supabase
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (readError) throw readError;

      if (!existing) {
        const { error: insertError } = await supabase
          .from("user_preferences")
          .insert({
            user_id: user.id,
            ...preferencePatch,
          });

        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from("user_preferences")
          .update({
            ...preferencePatch,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (updateError) throw updateError;
      }
    }

    /*
     * ------------------------------------------------------------
     * RETURN UPDATED DATA
     * ------------------------------------------------------------
     */

    const [{ data: updatedProfile, error: updatedProfileError }, { data: updatedPreferences, error: updatedPreferencesError }] =
      await Promise.all([
        supabase
          .from("users")
          .select(
            "first_name,last_name,email,job_title,department,avatar_initials,avatar_url",
          )
          .eq("id", user.id)
          .single(),

        supabase
          .from("user_preferences")
          .select(
            "theme,sidebar_collapsed,notification_preferences,updated_at",
          )
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);

    if (updatedProfileError) throw updatedProfileError;
    if (updatedPreferencesError) throw updatedPreferencesError;

    return successResponse({
      profile: toProfileShape(updatedProfile, user.email ?? ""),
      ...toPreferenceShape(updatedPreferences),
    });
  } catch (error) {
    console.error("PATCH /api/settings failed:", error);
    return internalErrorResponse();
  }
}