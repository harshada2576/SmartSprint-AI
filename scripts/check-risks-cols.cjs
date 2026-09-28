const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='risks' ORDER BY ordinal_position;");
  console.log(res.rows);
  await client.end();
}

main().catch(console.error);
