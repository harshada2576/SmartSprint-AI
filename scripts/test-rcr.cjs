require("dotenv").config({ path: [".env.local", ".env"] });
const { Client } = require("pg");

async function testCurrentRole() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Testing 1: quoted column definition...");
  try {
    await client.query("BEGIN;");
    await client.query(`
      CREATE TABLE test_rcr (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "current_role" text NOT NULL,
        requested_role text NOT NULL,
        CHECK (requested_role <> "current_role")
      );
    `);
    console.log("Test 1 SUCCESS with quoted current_role in definition and check!");
    await client.query("ROLLBACK;");
  } catch (e) {
    await client.query("ROLLBACK;");
    console.log("Test 1 FAILED:", e.message);
  }

  console.log("Testing 2: quoted column definition with unquoted in CHECK...");
  try {
    await client.query("BEGIN;");
    await client.query(`
      CREATE TABLE test_rcr (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "current_role" text NOT NULL,
        requested_role text NOT NULL,
        CHECK (requested_role <> current_role)
      );
    `);
    console.log("Test 2 SUCCESS with quoted in col, unquoted in check!");
    await client.query("ROLLBACK;");
  } catch (e) {
    await client.query("ROLLBACK;");
    console.log("Test 2 FAILED:", e.message);
  }

  await client.end();
}

testCurrentRole().catch(console.error);
