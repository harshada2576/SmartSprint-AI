const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const v = await client.query('SELECT version()');
  console.log('PG_VERSION:', v.rows[0].version);

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema='public' AND table_type='BASE TABLE' 
    ORDER BY table_name
  `);
  console.log('TABLES_COUNT:', tables.rows.length);
  console.log('TABLES:', tables.rows.map(r => r.table_name).join(', '));

  const rls = await client.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname='public' AND rowsecurity=true 
    ORDER BY tablename
  `);
  console.log('RLS_ENABLED_TABLES_COUNT:', rls.rows.length);

  const pol = await client.query(`
    SELECT count(*) AS count 
    FROM pg_policies 
    WHERE schemaname='public'
  `);
  console.log('POLICIES_COUNT:', pol.rows[0].count);

  const funcs = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema='public' AND routine_name LIKE 'smartsprint_%'
    ORDER BY routine_name
  `);
  console.log('SMARTSPRINT_FUNCS_COUNT:', funcs.rows.length);
  console.log('FUNCTIONS:', funcs.rows.map(r => r.routine_name).join(', '));

  const triggers = await client.query(`
    SELECT trigger_name, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_schema='public' 
    ORDER BY trigger_name
  `);
  console.log('TRIGGERS_COUNT:', triggers.rows.length);

  const enums = await client.query(`
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  console.log('ENUMS_COUNT:', enums.rows.length);
  enums.rows.forEach(e => {
    const vals = Array.isArray(e.enum_values) ? e.enum_values.join(', ') : e.enum_values;
    console.log(`  ${e.typname}: [${vals}]`);
  });

  const rowCounts = await client.query(`
    SELECT 
      (SELECT count(*) FROM public.organizations) AS orgs,
      (SELECT count(*) FROM public.users) AS users,
      (SELECT count(*) FROM public.organization_members) AS org_members,
      (SELECT count(*) FROM public.projects) AS projects,
      (SELECT count(*) FROM public.tasks) AS tasks,
      (SELECT count(*) FROM public.sprints) AS sprints,
      (SELECT count(*) FROM public.requirements) AS requirements,
      (SELECT count(*) FROM public.risks) AS risks,
      (SELECT count(*) FROM public.documents) AS documents,
      (SELECT count(*) FROM public.role_change_requests) AS role_change_requests,
      (SELECT count(*) FROM public.ai_insights) AS ai_insights
  `);
  console.log('ROW_COUNTS:', JSON.stringify(rowCounts.rows[0]));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
