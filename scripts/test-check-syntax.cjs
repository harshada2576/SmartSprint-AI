require("dotenv").config({ path: [".env.local", ".env"] });
const { Client } = require("pg");

async function testCheckSyntax() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Testing with requested_role <> \"current_role\"...");
  try {
    await client.query("BEGIN;");
    await client.query(`
      CREATE TABLE test_rcr1 (
        "current_role" user_role NOT NULL,
        requested_role user_role NOT NULL,
        CHECK (requested_role <> "current_role")
      );
    `);
    console.log("SUCCESS: requested_role <> \"current_role\"");
    await client.query("ROLLBACK;");
  } catch (e) {
    await client.query("ROLLBACK;");
    console.log("FAILED 1:", e.message);
  }

  console.log("Testing with table prefix role_change_requests_test.current_role...");
  try {
    await client.query("BEGIN;");
    await client.query(`
      CREATE TABLE test_rcr2 (
        "current_role" user_role NOT NULL,
        requested_role user_role NOT NULL,
        CHECK (requested_role <> test_rcr2.current_role)
      );
    `);
    console.log("SUCCESS: requested_role <> test_rcr2.current_role");
    await client.query("ROLLBACK;");
  } catch (e) {
    await client.query("ROLLBACK;");
    console.log("FAILED 2:", e.message);
  }

  await client.end();
}

testCheckSyntax().catch(console.error);
