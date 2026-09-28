import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared mutation helpers for RLS-scoped writes.
 *
 * Ownership: Backend/API agent (`src/repositories/**`).
 *
 * Security:
 * - Every helper takes the caller's RLS-enforcing Supabase client (carrying
 *   the verified JWT). Privileged database pools and the service-role key
 *   are never imported here.
 * - PostgreSQL remains the final authority: RLS `WITH CHECK` / `USING`
 *   policies and integrity triggers enforce tenancy even if a service-level
 *   pre-check is raced. Pre-checks exist only to return precise 400/403/404
 *   answers instead of generic 500s.
 * - Thrown `DbWriteError`s carry generic kinds only; routes log them
 *   server-side and return the shared `INTERNAL_ERROR` envelope (never
 *   SQL/details).
 */

export type DbWriteKind =
  | "unique_violation"
  | "rls_denied"
  | "foreign_key"
  | "failed";

/** Coded write failure. `kind` is the only thing callers switch on. */
export class DbWriteError extends Error {
  readonly kind: DbWriteKind;
  readonly pgCode?: string;

  constructor(kind: DbWriteKind, message: string, pgCode?: string) {
    super(message);
    this.name = "DbWriteError";
    this.kind = kind;
    this.pgCode = pgCode;
  }
}

function pgCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : String(error);
}

/**
 * Maps a Supabase/PostgREST write error to a generic `DbWriteError`.
 * `fallback` is a non-sensitive operation label for server-side logs.
 */
export function toDbWriteError(error: unknown, fallback: string): DbWriteError {
  const code = pgCodeOf(error);
  const message = messageOf(error);
  if (code === "23505") {
    return new DbWriteError("unique_violation", `${fallback}_conflict`, code);
  }
  if (code === "23503") {
    return new DbWriteError("foreign_key", `${fallback}_reference`, code);
  }
  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security") ||
    message.includes("SmartSprint RLS")
  ) {
    return new DbWriteError("rls_denied", `${fallback}_denied`, code);
  }
  return new DbWriteError("failed", fallback, code);
}

/**
 * True when `userId` holds an `organization_members` row in `orgId`.
 * Evaluated through the caller's RLS client: rows outside the caller's
 * visible scope read as absent (fail-closed), which is exactly the verdict
 * mutation gates need.
 */
export async function isUserOrgMember(
  client: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new DbWriteError("failed", "membership_lookup_failed");
  }
  return data !== null;
}
