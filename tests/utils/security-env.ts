/**
 * Environment detection for security tests.
 *
 * Live RLS behavioral tests need a reachable PostgreSQL/Supabase database with
 * migrations 0000+0001+0002 applied and seed data loaded. Static contract tests
 * need no database and always run.
 *
 * Secrets policy: tests read connection info ONLY from environment variables
 * (DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY). Nothing is hardcoded and service-role keys are
 * never committed (see tests/auth/* SRV-01 scan).
 */

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

export function hasSupabaseRestEnv(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** True when any live-database env is present (reachability still probed). */
export function isLiveEnvConfigured(): boolean {
  return Boolean(getDatabaseUrl()) || hasSupabaseRestEnv();
}

/**
 * MarkerLogged once per worker so skipped suites explain themselves instead of
 * silently passing. Every live suite must call this (or check isLiveDb) and
 * use it.skipIf / describe.skipIf when false.
 */
let liveUnavailableLogged = false;

export function reportLiveSkipped(reason: string): void {
  if (!liveUnavailableLogged) {
    liveUnavailableLogged = true;
    console.warn(
      `[security-tests] LIVE RLS BEHAVIORAL TESTS NOT EXECUTED (${reason}). ` +
        `Static contract tests still validate the migration + fixtures. ` +
        `To run live: set DATABASE_URL (Supabase pooler URL, percent-encode ` +
        `@ as %40) with migrations 0000/0001/0002 applied and seed loaded, ` +
        `then re-run npm run test:security.`,
    );
  }
}
