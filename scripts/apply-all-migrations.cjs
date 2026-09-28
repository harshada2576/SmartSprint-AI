require("dotenv").config({ path: [".env.local", ".env"] });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function applyMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  console.log("Connected to PostgreSQL database.");

  const migrations = [
    "0002_rls_security_foundation.sql",
    "0004_rbac_expansion.sql",
    "0005_rbac_rls_rewrite.sql",
    "0006_hr_member_removal.sql",
  ];

  for (const mig of migrations) {
    const fullPath = path.join(__dirname, "..", "supabase", "migrations", mig);
    console.log(`\n========================================`);
    console.log(`Applying migration: ${mig}`);
    console.log(`========================================`);
    const sql = fs.readFileSync(fullPath, "utf8");

    try {
      await client.query(sql);
      console.log(`Migration ${mig} APPLIED SUCCESSFULLY!`);
    } catch (err) {
      console.error(`Migration ${mig} FAILED:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log("\nAll pending migrations applied successfully!");
  await client.end();
}

applyMigrations();
