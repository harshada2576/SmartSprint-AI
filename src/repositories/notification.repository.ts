import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPagination,
  type PaginatedResult,
} from "@/types/secondary-api";
import { sanitizeIlikeTerm } from "./backlog.repository";

export interface NotificationListOptions {
  type?: string;
  read?: boolean;
  priority?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  read: boolean;
  action_label: string | null;
  created_at: string;
}

/**
 * Notification inbox scoped strictly to one user.
 *
 * SECURITY: every function takes the inbox owner's verified `userId`
 * (the authenticated session subject) and the caller's RLS-enforcing
 * Supabase client — never the privileged Drizzle pool. Queries always
 * constrain `user_id = userId` (defense in depth over
 * `notifications_select_own` / `notifications_update_own`, which restrict
 * rows to `user_id = auth.uid()` even for ADMINs), so knowing another
 * user's ID can never expose or mutate their notifications. There is no
 * client INSERT path: notifications are system-generated via the trusted
 * server lane. Only the `read` flag is ever mutated here.
 */
const NOTIFICATION_SELECT =
  "id,user_id,type,title,description,priority,read,action_label,created_at";

export async function listNotifications(
  client: SupabaseClient,
  userId: string,
  options: NotificationListOptions,
): Promise<PaginatedResult<NotificationRow>> {
  const { page, pageSize } = options;

  let query = client
    .from("notifications")
    .select(NOTIFICATION_SELECT, { count: "exact" })
    .eq("user_id", userId);

  if (options.type) {
    query = query.eq("type", options.type);
  }
  if (options.priority) {
    query = query.eq("priority", options.priority);
  }
  if (options.read !== undefined) {
    query = query.eq("read", options.read);
  }
  const term = options.search ? sanitizeIlikeTerm(options.search) : "";
  if (term) {
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }

  query = query.order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    throw error;
  }

  const total = count ?? 0;
  return {
    items: ((data ?? []) as unknown) as NotificationRow[],
    pagination: buildPagination(page, pageSize, total),
  };
}

export async function getUnreadNotificationCount(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) {
    throw error;
  }
  return count ?? 0;
}

/**
 * Flips the `read` flag on one owned notification. Returns the updated row,
 * or null when the ID does not exist in the caller's inbox (covers both
 * unknown IDs and other users' IDs without distinguishing them).
 */
export async function markNotificationRead(
  client: SupabaseClient,
  userId: string,
  id: string,
  read: boolean,
): Promise<NotificationRow | null> {
  const { data, error } = await client
    .from("notifications")
    .update({ read })
    .eq("id", id)
    .eq("user_id", userId)
    .select(NOTIFICATION_SELECT)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return ((data ?? null) as unknown) as NotificationRow | null;
}

/** Marks the caller's whole inbox read. Returns the number of rows updated. */
export async function markAllNotificationsRead(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { error, count } = await client
    .from("notifications")
    .update({ read: true }, { count: "exact" })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) {
    throw error;
  }
  return count ?? 0;
}
