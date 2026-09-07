require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkTables() {
  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("\nPUBLIC TABLES:\n");
    for (const row of result.rows) {
      console.log(row.table_name);
    }

    await client.end();
  } catch (error) {
    console.error("CHECK FAILED:", error.message);
    process.exit(1);
  }
}

checkTables();