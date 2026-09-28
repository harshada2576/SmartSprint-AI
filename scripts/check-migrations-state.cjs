require("dotenv").config({ path: [".env.local", ".env"] });
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function checkState() {
  await client.connect();

  console.log("=== Checking Migration Tables ===");
  const migTables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name LIKE '%migration%' OR table_name LIKE '%drizzle%';
  `);
  console.log("Migration tables found:", migTables.rows);

  for (const t of migTables.rows) {
    try {
      const records = await client.query(`SELECT * FROM "${t.table_schema}"."${t.table_name}" LIMIT 20;`);
      console.log(`Records in ${t.table_schema}.${t.table_name}:`, records.rows);
    } catch (e) {
      console.log(`Error reading ${t.table_schema}.${t.table_name}:`, e.message);
    }
  }

  console.log("\n=== Checking Key Tables from 0004/0005/0006 ===");
  const checkTables = ['role_change_requests', 'task_dependencies', 'task_attachments'];
  for (const table of checkTables) {
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      );
    `, [table]);
    console.log(`Table ${table} exists:`, res.rows[0].exists);
  }

  console.log("\n=== Checking Enums ===");
  const enumsRes = await client.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder;
  `);
  const enums = {};
  enumsRes.rows.forEach(r => {
    if (!enums[r.typname]) enums[r.typname] = [];
    enums[r.typname].push(r.enumlabel);
  });
  console.log("Public Enums:", enums);

  console.log("\n=== Checking RLS Helpers in 0005 ===");
  const funcsRes = await client.query(`
    SELECT proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND proname LIKE 'smartsprint%';
  `);
  console.log("Functions starting with smartsprint:", funcsRes.rows.map(r => r.proname));

  await client.end();
}

checkState().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
