import "dotenv/config";

// Global banner so every run states the live/static boundary explicitly.
// Static contract tests always run. Live behavioral tests require a reachable
// database (see tests/utils/security-env.ts) and skip otherwise — they never
// fake a pass.
const hasDbUrl = Boolean(process.env.DATABASE_URL);
const hasSupabaseRest =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!hasDbUrl && !hasSupabaseRest) {
  console.warn(
    "[security-tests] No DATABASE_URL or Supabase REST env detected. " +
      "Static RLS contract tests will run. " +
      "LIVE RLS BEHAVIORAL TESTS NOT EXECUTED.",
  );
} else {
  console.info(
    "[security-tests] Database env detected. Static contract tests will run; " +
      "live behavioral suites will attempt a connection probe and skip " +
      "individually if the database is unreachable.",
  );
}
