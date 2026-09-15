import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __smartSprintPgPool?: Pool;
};

export const pool =
  globalForDb.__smartSprintPgPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__smartSprintPgPool = pool;
}

export const db = drizzle(pool);