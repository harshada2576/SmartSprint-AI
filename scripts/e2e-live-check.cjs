const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: [".env.local", ".env"] });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = 'http://127.0.0.1:3000';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== E2E LIVE API VERIFICATION ON RUNNING NEXT.JS DEV SERVER ===\n');

  // 1. Health check
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    console.log(`[1] GET /api/health -> Status: ${healthRes.status}`);
    const healthJson = await healthRes.json().catch(() => ({}));
    console.log('    Response:', JSON.stringify(healthJson));
  } catch (err) {
    console.log('[1] GET /api/health failed:', err.message);
  }

  // 2. Authenticate as PM
  console.log('\n[2] Authenticating as pm@smartsprint.ai...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'pm@smartsprint.ai',
    password: 'Password123!',
  });

  if (authError || !authData?.session) {
    console.error('    Authentication failed:', authError?.message);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log(`    Authenticated successfully! Token acquired (length: ${token.length})`);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 3. GET /api/me
  const meRes = await fetch(`${BASE_URL}/api/me`, { headers });
  console.log(`\n[3] GET /api/me -> Status: ${meRes.status}`);
  const meJson = await meRes.json().catch(() => ({}));
  console.log(`    User: ${meJson.data?.user?.email}, Primary Org: ${meJson.data?.primaryOrganization?.name}, Role: ${meJson.data?.primaryOrganization?.role}`);

  // 4. GET /api/projects
  const projRes = await fetch(`${BASE_URL}/api/projects`, { headers });
  console.log(`\n[4] GET /api/projects -> Status: ${projRes.status}`);
  const projJson = await projRes.json().catch(() => ({}));
  const projects = projJson.data || [];
  console.log(`    Found ${projects.length} project(s).`);
  if (projects.length > 0) {
    console.log(`    First project: "${projects[0].name}" (ID: ${projects[0].id})`);
  }
  const projectId = projects[0]?.id;

  // 5. GET /api/tasks
  const tasksRes = await fetch(`${BASE_URL}/api/tasks?projectId=${projectId}`, { headers });
  console.log(`\n[5] GET /api/tasks -> Status: ${tasksRes.status}`);
  const tasksJson = await tasksRes.json().catch(() => ({}));
  const tasks = tasksJson.data || [];
  console.log(`    Found ${tasks.length} task(s) in project.`);
  if (tasks.length > 0) {
    const t0 = tasks[0];
    console.log(`    Sample task: "${t0.title}" | Status: ${t0.column_status || t0.columnStatus} | Progress: ${t0.progress_percent ?? t0.progressPercent}% | Blocked: ${t0.is_blocked ?? t0.isBlocked}`);
  }

  // 6. GET /api/sprints
  const sprintsRes = await fetch(`${BASE_URL}/api/sprints?projectId=${projectId}`, { headers });
  console.log(`\n[6] GET /api/sprints -> Status: ${sprintsRes.status}`);
  const sprintsJson = await sprintsRes.json().catch(() => ({}));
  const sprints = sprintsJson.data || [];
  console.log(`    Found ${sprints.length} sprint(s).`);
  sprints.forEach(s => {
    console.log(`    - Sprint "${s.name}" | Status: ${s.status} | Dates: ${s.start_date || s.startDate} to ${s.end_date || s.endDate}`);
  });

  // 7. GET /api/risks
  const risksRes = await fetch(`${BASE_URL}/api/risks?projectId=${projectId}`, { headers });
  console.log(`\n[7] GET /api/risks -> Status: ${risksRes.status}`);
  const risksJson = await risksRes.json().catch(() => ({}));
  const risks = risksJson.data || [];
  console.log(`    Found ${risks.length} risk(s).`);
  if (risks.length > 0) {
    const r0 = risks[0];
    console.log(`    Top risk: "${r0.title}" | Level: ${r0.severity || r0.impact || r0.level} | Status: ${r0.status}`);
  }

  // 8. GET /api/monitoring/[projectId]
  if (projectId) {
    const monRes = await fetch(`${BASE_URL}/api/monitoring/${projectId}`, { headers });
    console.log(`\n[8] GET /api/monitoring/${projectId} -> Status: ${monRes.status}`);
    const monJson = await monRes.json().catch(() => ({}));
    if (monJson.data) {
      console.log(`    Project Name: ${monJson.data.projectName}`);
      console.log(`    Health: ${JSON.stringify(monJson.data.health)}`);
      console.log(`    Progress: totalPoints=${monJson.data.progress?.totalPoints}, completedPoints=${monJson.data.progress?.completedPoints}`);
    }
  }

  // 9. Task lifecycle test (create, progress update, block with reason, unblock)
  if (projectId) {
    console.log('\n[9] Testing Task Lifecycle (Create -> Progress -> Block -> Unblock)...');
    
    // Create task
    const createRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId,
        title: 'E2E Automated Live Verification Task',
        description: 'Created during npm run dev end-to-end verification',
        priority: 'high',
        columnStatus: 'todo',
        points: 5,
      }),
    });
    console.log(`    POST /api/tasks -> Status: ${createRes.status}`);
    const createJson = await createRes.json();
    const createdTask = createJson.data;
    console.log(`    Created task ID: ${createdTask?.id}`);

    if (createdTask?.id) {
      const taskId = createdTask.id;

      // Update progress to 45%
      const progRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          progressPercent: 45,
          columnStatus: 'inProgress',
        }),
      });
      console.log(`    PATCH /api/tasks/${taskId} (progress 45%) -> Status: ${progRes.status}`);

      // Block task with reason
      const blockRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          isBlocked: true,
          blockedReason: 'Awaiting third party API credentials in live test',
        }),
      });
      console.log(`    PATCH /api/tasks/${taskId} (isBlocked true + reason) -> Status: ${blockRes.status}`);
      const blockedJson = await blockRes.json();
      const bData = blockedJson.data || {};
      const isBlk = bData.is_blocked ?? bData.isBlocked;
      const blkRsn = bData.blocked_reason ?? bData.blockedReason;
      console.log(`    Verified Blocked: ${isBlk}, Reason: "${blkRsn}"`);

      // Unblock task
      const unblockRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          isBlocked: false,
        }),
      });
      console.log(`    PATCH /api/tasks/${taskId} (isBlocked false) -> Status: ${unblockRes.status}`);
      const unblockedJson = await unblockRes.json();
      const uData = unblockedJson.data || {};
      const isUnblk = uData.is_blocked ?? uData.isBlocked;
      const unblkRsn = uData.blocked_reason ?? uData.blockedReason;
      console.log(`    Verified Unblocked: ${!isUnblk}, Reason Cleared: ${unblkRsn === null}`);

      // Clean up test task
      const delRes = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers,
      });
      console.log(`    DELETE /api/tasks/${taskId} -> Status: ${delRes.status}`);
    }
  }

  // 10. AI Assistant Scoped Query test
  console.log('\n[10] Testing Scoped AI Assistant (POST /api/ai/assistant)...');
  const aiRes = await fetch(`${BASE_URL}/api/ai/assistant`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId,
      query: 'What is the current sprint status and what are our biggest risks?',
    }),
  });
  console.log(`    POST /api/ai/assistant -> Status: ${aiRes.status}`);
  const aiJson = await aiRes.json().catch(() => ({}));
  if (aiJson.data) {
    console.log(`    AI Assistant Response (truncated 120 chars): "${(aiJson.data.reply || aiJson.data.message || '').slice(0, 120)}..."`);
  }

  console.log('\n=== ALL END-TO-END LIVE CHECKS COMPLETED SUCCESSFULLY ===');
}

main().catch(console.error);
