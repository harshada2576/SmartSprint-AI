import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Drizzle Kit configuration.
 *
 * WARNING — migration journal drift: `supabase/migrations/meta/` tracks
 * only 0000/0001, while the supported deployment chain is the hand-managed
 * SQL files 0000–0010 (applied via `supabase db push` or `psql`, per
 * README). Do NOT run `drizzle-kit generate/migrate/push` against the
 * operational database: `generate` would diff `schema.ts` against the
 * stale 0001 snapshot and propose a destructive squash, and `migrate`/`push`
 * bypass the reviewed SQL chain. Reconcile the journal only against an
 * isolated disposable database.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./supabase/schema.ts",
  out: "./supabase/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});