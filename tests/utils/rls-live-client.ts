/**
 * Live RLS client helper.
 *
 * Two lanes (service-role separation is load-bearing — never mix them):
 *
 * 1. USER LANE (`runAsUser`) — the ONLY lane used to assert whether RLS blocks
 *    a user. Opens a transaction, switches to `authenticated` (or `anon` when
 *    sub is null), pins `request.jwt.claims.sub` so `auth.uid()` resolves
 *    exactly as in production, runs the callback, then ALWAYS rolls back.
 *    Rollback keeps fixtures immutable across runs.
 *
 * 2. PRIVILEGED LANE (`runAsPrivileged`) — controlled setup/cleanup reads only
 *    (fixture existence checks, before/after diffs). Never used to assert an
 *    allow/deny verdict for a user.
 *
 * No Supabase service-role key is used on the user lane. No RLS semantics are
 * mocked: every verdict comes from PostgreSQL policy evaluation, or the test
 * is skipped with LIVE RLS BEHAVIORAL TESTS NOT EXECUTED.
 */
import { Pool, type PoolClient } from "pg";
import { getDatabaseUrl } from "./security-env";

export class LiveUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveUnavailableError";
  }
}

let pool: Pool | undefined;
let probeCache: boolean | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
      throw new LiveUnavailableError("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString, connectionTimeoutMillis: 8000 });
  }
  return pool;
}

export async function closeLivePool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = undefined;
  }
}

/** Cheap reachability probe (cached). Never throws — returns false. */
export async function probeLiveDb(): Promise<boolean> {
  if (probeCache !== undefined) return probeCache;
  try {
    const p = getPool();
    await p.query("select 1 as ok");
    probeCache = true;
  } catch {
    probeCache = false;
  }
  return probeCache;
}

function isMissingRoleError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error);
  return msg.includes("does not exist") && msg.includes("role");
}

/**
 * Run `fn` as an authenticated user (`sub`) or as anon (`sub === null`).
 * Always rolls back. Throws LiveUnavailableError when the database or the
 * Supabase `authenticated`/`anon` roles are unavailable (caller converts to a
 * visible skip — never a fake pass).
 */
export async function runAsUser<T>(
  sub: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const p = getPool();
  const client = await p.connect().catch((error: unknown) => {
    throw new LiveUnavailableError(`cannot connect to database: ${String(error)}`);
  });
  try {
    await client.query("BEGIN");
    try {
      if (sub === null) {
        await client.query("SET LOCAL ROLE anon");
        await client.query("SELECT set_config('request.jwt.claims', null, true)");
      } else {
        await client.query("SET LOCAL ROLE authenticated");
        const claims = JSON.stringify({ sub, role: "authenticated" });
        await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
      }
    } catch (error: unknown) {
      if (isMissingRoleError(error)) {
        throw new LiveUnavailableError(
          `database lacks Supabase roles (authenticated/anon): ${String(error)}`,
        );
      }
      throw error;
    }
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

/**
 * Privileged lane for controlled setup/cleanup READS ONLY (fixture existence,
 * before/after diffs). Must never be used to assert a user allow/deny verdict.
 */
export async function runAsPrivileged<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect().catch((error: unknown) => {
    throw new LiveUnavailableError(`cannot connect to database: ${String(error)}`);
  });
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** True when a write failed because RLS/policy/trigger denied it (fail-closed). */
export function isRlsViolation(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const code = err?.code ?? "";
  const message = String(err?.message ?? error);
  if (code === "42501") return true; // insufficient_privilege (RLS deny)
  if (code === "P0001" && message.includes("SmartSprint RLS")) return true; // integrity trigger
  return (
    message.includes("row-level security") ||
    message.includes("violates row-level security") ||
    (message.includes("policy") && message.includes("for table")) ||
    message.includes("SmartSprint RLS")
  );
}
