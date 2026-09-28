require("dotenv").config({ path: [".env.local", ".env"] });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database.");

    const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "0003_mvp_task_comments_risks_sprints.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    console.log("Applying migration 0003_mvp_task_comments_risks_sprints.sql...");
    await client.query(sql);
    console.log("Migration 0003 applied successfully!");

    await client.end();
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
