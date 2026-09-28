require("dotenv").config({ path: [".env.local", ".env"] });
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  console.log("Connected to DB.");

  try {
    await client.query("BEGIN;");
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_change_requests_test (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        "current_role" user_role NOT NULL,
        requested_role user_role NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        requested_by uuid NOT NULL,
        decided_by uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (requested_role <> "current_role")
      );
    `);
    console.log("Successfully created test table with \"current_role\"!");
  } catch (err) {
    console.error("Test failed:", err.message);
  } finally {
    await client.query("ROLLBACK;");
    await client.end();
  }
}

run();
