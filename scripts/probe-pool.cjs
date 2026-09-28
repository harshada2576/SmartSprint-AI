require("dotenv").config({ path: [".env.local", ".env"] });
const { Pool } = require("pg");

async function testPool() {
  const connectionString = process.env.DATABASE_URL;
  console.log("DATABASE_URL is set:", Boolean(connectionString));
  
  // Test without extra ssl options (like rls-live-client.ts currently does)
  console.log("Testing Pool without extra ssl config...");
  try {
    const pool1 = new Pool({ connectionString, connectionTimeoutMillis: 8000 });
    const res = await pool1.query("SELECT 1 as ok");
    console.log("Pool without ssl config: SUCCESS!", res.rows);
    await pool1.end();
  } catch (err) {
    console.log("Pool without ssl config FAILED:", err.message);
  }

  // Test with ssl: { rejectUnauthorized: false }
  console.log("Testing Pool with ssl: { rejectUnauthorized: false }...");
  try {
    const pool2 = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    const res = await pool2.query("SELECT 1 as ok");
    console.log("Pool with ssl config: SUCCESS!", res.rows);
    await pool2.end();
  } catch (err) {
    console.log("Pool with ssl config FAILED:", err.message);
  }
}

testPool();
