const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");
require("dotenv").config({ path: [".env.local", ".env"] });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_KEY || !DATABASE_URL) {
  console.error("Missing environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "Password123!";

const DEMO_USERS = [
  {
    email: "admin@smartsprint.ai",
    firstName: "Admin",
    lastName: "User",
    role: "ADMIN",
    title: "System Administrator",
  },
  {
    email: "pm@smartsprint.ai",
    firstName: "Sarah",
    lastName: "Jenkins",
    role: "PROJECT_MANAGER",
    title: "Lead Project Manager",
  },
  {
    email: "dev1@smartsprint.ai",
    firstName: "Alex",
    lastName: "Rivera",
    role: "DEVELOPER",
    title: "Senior Fullstack Engineer",
  },
  {
    email: "dev2@smartsprint.ai",
    firstName: "Maria",
    lastName: "Santos",
    role: "DEVELOPER",
    title: "Backend Specialist",
  },
  {
    email: "dev3@smartsprint.ai",
    firstName: "Rahul",
    lastName: "Sharma",
    role: "DEVELOPER",
    title: "Frontend Engineer",
  },
];

async function getOrCreateAuthUser(u) {
  const { data: listData } = await supabase.auth.admin.listUsers();
  const existing = listData?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

  if (existing) {
    console.log(`✓ Auth user exists: ${u.email} (${existing.id})`);
    return existing.id;
  }

  const { data: createData, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: u.firstName,
      last_name: u.lastName,
      role: u.role,
    },
  });

  if (error) {
    throw new Error(`Failed to create auth user ${u.email}: ${error.message}`);
  }

  console.log(`+ Created auth user: ${u.email} (${createData.user.id})`);
  return createData.user.id;
}

async function runSeed() {
  console.log("=== Starting SmartSprint AI MVP Demo Seeding ===");

  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  try {
    // 1. Provision Auth Users
    console.log("\n1. Provisioning Auth Users in Supabase Auth...");
    const userMap = new Map();
    for (const u of DEMO_USERS) {
      const authId = await getOrCreateAuthUser(u);
      userMap.set(u.email, { ...u, id: authId });
    }

    // 2. Upsert into public.users
    console.log("\n2. Upserting into public.users...");
    for (const [email, u] of userMap.entries()) {
      const existingUser = await pg.query("SELECT id FROM users WHERE email = $1", [u.email]);
      if (existingUser.rows.length > 0 && existingUser.rows[0].id !== u.id) {
        await pg.query(
          "UPDATE users SET id = $1, first_name = $2, last_name = $3, job_title = $4, status = 'active', updated_at = NOW() WHERE email = $5",
          [u.id, u.firstName, u.lastName, u.title, u.email]
        );
      } else {
        await pg.query(
          `
          INSERT INTO users (id, first_name, last_name, email, job_title, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
          ON CONFLICT (id) DO UPDATE
          SET first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              job_title = EXCLUDED.job_title,
              updated_at = NOW()
          `,
          [u.id, u.firstName, u.lastName, u.email, u.title]
        );
      }
    }
    console.log("✓ All demo users synchronized in public.users");

    // 3. Organization
    console.log("\n3. Ensuring Demo Organization...");
    const orgRes = await pg.query(
      `
      INSERT INTO organizations (name, slug, industry, timezone, created_at, updated_at)
      VALUES ('SmartSprint Demo Organization', 'smartsprint-demo-org', 'Technology', 'UTC', NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
      `
    );
    const orgId = orgRes.rows[0].id;
    console.log(`✓ Demo Organization ID: ${orgId}`);

    // 4. Link Users in organization_members
    console.log("\n4. Linking Users in organization_members...");
    for (const [email, u] of userMap.entries()) {
      await pg.query(
        `
        INSERT INTO organization_members (organization_id, user_id, role, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role
        `,
        [orgId, u.id, u.role]
      );
    }

    // Also link any existing Supabase auth accounts to this demo org as ADMIN
    const { data: allAuth } = await supabase.auth.admin.listUsers();
    if (allAuth?.users) {
      for (const au of allAuth.users) {
        if (!userMap.has(au.email?.toLowerCase())) {
          const parts = (au.email || "user@example.com").split("@")[0].split(".");
          const fName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Demo";
          const lName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "User";
          
          const existRes = await pg.query("SELECT id FROM users WHERE id = $1 OR email = $2", [au.id, au.email]);
          if (existRes.rows.length === 0) {
            await pg.query(
              `INSERT INTO users (id, first_name, last_name, email, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())`,
              [au.id, fName, lName, au.email]
            );
          }
          const memberUserId = existRes.rows.length > 0 ? existRes.rows[0].id : au.id;

          await pg.query(
            `
            INSERT INTO organization_members (organization_id, user_id, role, created_at)
            VALUES ($1, $2, 'ADMIN', NOW())
            ON CONFLICT (organization_id, user_id) DO NOTHING
            `,
            [orgId, memberUserId]
          );
        }
      }
    }
    console.log("✓ All members assigned roles in SmartSprint Demo Organization");

    // 5. Project: "Online Food Delivery Platform"
    console.log("\n5. Ensuring Project: Online Food Delivery Platform...");
    const pmId = userMap.get("pm@smartsprint.ai").id;
    const projRes = await pg.query(
      `
      INSERT INTO projects (
        organization_id, name, code, description, client, manager_id,
        method, status, priority, progress, start_date, created_at, updated_at
      )
      VALUES (
        $1, 'Online Food Delivery Platform', 'FOOD',
        'End-to-end food delivery web & mobile platform connecting customers, restaurants, and delivery drivers with real-time tracking and automated payment split.',
        'Deliveroo Worldwide', $2,
        'scrum', 'active', 'high', 45, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [orgId, pmId]
    );

    let projectId = projRes.rows[0]?.id;
    if (!projectId) {
      const existingProj = await pg.query(
        `SELECT id FROM projects WHERE name = 'Online Food Delivery Platform' AND organization_id = $1 LIMIT 1`,
        [orgId]
      );
      projectId = existingProj.rows[0].id;
    }
    console.log(`✓ Project ID: ${projectId}`);

    // Project Members
    for (const [email, u] of userMap.entries()) {
      await pg.query(
        `
        INSERT INTO project_members (project_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [projectId, u.id]
      );
    }

    // 6. Sprints
    console.log("\n6. Creating Sprints with relative dates...");
    // Clear foreign references in tasks before clearing sprints
    await pg.query(`UPDATE tasks SET sprint_id = NULL WHERE project_id = $1`, [projectId]);
    await pg.query(`DELETE FROM sprints WHERE project_id = $1`, [projectId]);

    const s1Res = await pg.query(
      `
      INSERT INTO sprints (
        project_id, name, goal, status, start_date, end_date,
        capacity_points, capacity_hours, created_by, created_at, updated_at
      )
      VALUES (
        $1, 'Sprint 1 - Foundation & Auth',
        'Core architecture, authentication microservice, and restaurant portal baseline',
        'completed', (NOW() - INTERVAL '21 days')::date, (NOW() - INTERVAL '7 days')::date,
        30, 60, $2, NOW() - INTERVAL '22 days', NOW() - INTERVAL '7 days'
      )
      RETURNING id
      `,
      [projectId, pmId]
    );
    const sprint1Id = s1Res.rows[0].id;

    const s2Res = await pg.query(
      `
      INSERT INTO sprints (
        project_id, name, goal, status, start_date, end_date,
        capacity_points, capacity_hours, created_by, created_at, updated_at
      )
      VALUES (
        $1, 'Sprint 2 - Orders & Payments',
        'Complete checkout flow, payment gateway integration, and order status workflow',
        'active', (NOW() - INTERVAL '7 days')::date, (NOW() + INTERVAL '7 days')::date,
        40, 80, $2, NOW() - INTERVAL '8 days', NOW()
      )
      RETURNING id
      `,
      [projectId, pmId]
    );
    const sprint2Id = s2Res.rows[0].id;

    const s3Res = await pg.query(
      `
      INSERT INTO sprints (
        project_id, name, goal, status, start_date, end_date,
        capacity_points, capacity_hours, created_by, created_at, updated_at
      )
      VALUES (
        $1, 'Sprint 3 - Logistics & Delivery',
        'Driver assignment, geolocation routing, and customer push notifications',
        'planning', (NOW() + INTERVAL '8 days')::date, (NOW() + INTERVAL '22 days')::date,
        35, 70, $2, NOW(), NOW()
      )
      RETURNING id
      `,
      [projectId, pmId]
    );
    const sprint3Id = s3Res.rows[0].id;
    console.log(`✓ Sprints created: Sprint 1 (Completed), Sprint 2 (Active), Sprint 3 (Planned)`);

    // 7. Requirements (Epics)
    console.log("\n7. Creating Epics / Requirements...");
    // Clear tasks & backlog before requirements
    await pg.query(`DELETE FROM backlog WHERE project_id = $1`, [projectId]);
    await pg.query(`DELETE FROM tasks WHERE project_id = $1`, [projectId]);
    await pg.query(`DELETE FROM requirements WHERE project_id = $1`, [projectId]);

    const req1Res = await pg.query(
      `
      INSERT INTO requirements (
        project_id, display_id, title, description, category, status, priority,
        created_at, updated_at
      )
      VALUES (
        $1, 'REQ-FOOD-001', 'User Authentication & Multi-Role RBAC',
        'JWT-based secure authentication supporting Admin, PM, and Developer roles with session management',
        'security', 'completed', 'high', NOW() - INTERVAL '25 days', NOW()
      )
      RETURNING id
      `,
      [projectId]
    );
    const req1Id = req1Res.rows[0].id;

    const req2Res = await pg.query(
      `
      INSERT INTO requirements (
        project_id, display_id, title, description, category, status, priority,
        created_at, updated_at
      )
      VALUES (
        $1, 'REQ-FOOD-002', 'Restaurant & Menu Management',
        'Restaurant listings, categorized menus, dish variations, and pricing engine',
        'feature', 'completed', 'high', NOW() - INTERVAL '25 days', NOW()
      )
      RETURNING id
      `,
      [projectId]
    );
    const req2Id = req2Res.rows[0].id;

    const req3Res = await pg.query(
      `
      INSERT INTO requirements (
        project_id, display_id, title, description, category, status, priority,
        created_at, updated_at
      )
      VALUES (
        $1, 'REQ-FOOD-003', 'Checkout & Payment Processing',
        'Payment gateway integration, webhook signature verification, and automated settlement',
        'feature', 'inProgress', 'high', NOW() - INTERVAL '20 days', NOW()
      )
      RETURNING id
      `,
      [projectId]
    );
    const req3Id = req3Res.rows[0].id;

    const req4Res = await pg.query(
      `
      INSERT INTO requirements (
        project_id, display_id, title, description, category, status, priority,
        created_at, updated_at
      )
      VALUES (
        $1, 'REQ-FOOD-004', 'Driver Logistics & Realtime Geolocation',
        'Driver assignment algorithm, real-time vehicle positioning, and dispatch alerts',
        'feature', 'draft', 'medium', NOW() - INTERVAL '15 days', NOW()
      )
      RETURNING id
      `,
      [projectId]
    );
    const req4Id = req4Res.rows[0].id;

    // 8. Tasks
    console.log("\n8. Creating Tasks across sprints...");
    const dev1Id = userMap.get("dev1@smartsprint.ai").id;
    const dev2Id = userMap.get("dev2@smartsprint.ai").id;
    const dev3Id = userMap.get("dev3@smartsprint.ai").id;

    // Task 1: Auth & Role System (Sprint 1, Done)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-01', 'Authentication & Role System',
        'Implement role-based middleware, token refresh, and login redirection.', 'high',
        'done', $4, 5,
        100, 10, 9, false,
        NOW() - INTERVAL '20 days', NOW() - INTERVAL '8 days'
      )
      `,
      [projectId, sprint1Id, req1Id, dev1Id]
    );

    // Task 2: Restaurant Management API (Sprint 1, Done)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-02', 'Restaurant Management API',
        'CRUD endpoints for restaurant profiles, operating hours, and location radius.', 'high',
        'done', $4, 8,
        100, 16, 15, false,
        NOW() - INTERVAL '20 days', NOW() - INTERVAL '9 days'
      )
      `,
      [projectId, sprint1Id, req2Id, dev2Id]
    );

    // Task 3: Menu Browsing & Search (Sprint 2, Done)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-03', 'Menu Browsing & Search',
        'Fast faceted search and filtering for restaurant menu items and dietary tags.', 'medium',
        'done', $4, 5,
        100, 10, 8, false,
        NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day'
      )
      `,
      [projectId, sprint2Id, req2Id, dev3Id]
    );

    // Task 4: Cart Management & Validation (Sprint 2, In Progress)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        due_date, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-04', 'Cart Management & Validation',
        'Client and server side item quantity limits, minimum order totals, and voucher calculation.', 'medium',
        'inProgress', $4, 5,
        65, 12, 7, false,
        (NOW() + INTERVAL '3 days')::date, NOW() - INTERVAL '6 days', NOW()
      )
      `,
      [projectId, sprint2Id, req3Id, dev1Id]
    );

    // Task 5: Payment Gateway Integration (Sprint 2, BLOCKED!)
    const paymentTaskRes = await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours,
        is_blocked, blocked_reason, blocked_at,
        due_date, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-05', 'Payment Gateway Integration',
        'Integrate payment gateway API, handle card webhooks, 3D Secure verification, and charge confirmation.', 'high',
        'blocked', $4, 8,
        30, 18, 5,
        true, 'Waiting for payment gateway credentials and merchant webhook signing keys from vendor.', NOW() - INTERVAL '26 hours',
        (NOW() + INTERVAL '24 hours')::date, NOW() - INTERVAL '6 days', NOW()
      )
      RETURNING id
      `,
      [projectId, sprint2Id, req3Id, dev2Id]
    );
    const paymentTaskId = paymentTaskRes.rows[0].id;

    // Task 6: Orders & Checkout Flow (Sprint 2, In Progress, Due Tomorrow)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        due_date, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'TSK-FD-06', 'Orders & Checkout Flow',
        'Coordinate checkout multi-step form, delivery address selector, and receipt dispatch.', 'high',
        'inProgress', $4, 8,
        40, 16, 7, false,
        (NOW() + INTERVAL '36 hours')::date, NOW() - INTERVAL '6 days', NOW()
      )
      `,
      [projectId, sprint2Id, req3Id, dev2Id]
    );

    // Task 7: Delivery Dispatch & Driver Tracking (Backlog / Planned)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        created_at, updated_at
      )
      VALUES (
        $1, NULL, $2, 'TSK-FD-07', 'Delivery Dispatch & Driver Tracking',
        'Routing optimization and driver allocation engine for active orders.', 'medium',
        'backlog', NULL, 8,
        0, 20, 0, false,
        NOW() - INTERVAL '4 days', NOW()
      )
      `,
      [projectId, req4Id]
    );

    // Task 8: Order Notification Service (Backlog / Available for Sprint Planning demo)
    await pg.query(
      `
      INSERT INTO tasks (
        project_id, sprint_id, requirement_id, display_id, title, description, priority,
        column_status, assignee_id, points,
        progress_percent, estimated_hours, actual_hours, is_blocked,
        created_at, updated_at
      )
      VALUES (
        $1, NULL, $2, 'TSK-FD-08', 'SMS & Email Notification Service',
        'Transactional notification triggers for customer order milestones.', 'low',
        'backlog', NULL, 3,
        0, 8, 0, false,
        NOW() - INTERVAL '3 days', NOW()
      )
      `,
      [projectId, req4Id]
    );
    console.log("✓ Real tasks created across Completed, Active, and Backlog");

    // 9. Task Comments
    console.log("\n9. Creating Task Comments...");
    await pg.query(`DELETE FROM task_comments WHERE task_id = $1`, [paymentTaskId]);
    await pg.query(
      `
      INSERT INTO task_comments (task_id, user_id, content, created_at, updated_at)
      VALUES
        ($1, $2, 'Reached out to merchant provider support for sandbox webhook keys. Ticket #9281 opened.', NOW() - INTERVAL '25 hours', NOW() - INTERVAL '25 hours'),
        ($1, $3, 'Escalated to our finance partnership lead to expedite credential issuance today.', NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours')
      `,
      [paymentTaskId, dev2Id, pmId]
    );
    console.log("✓ Task comments recorded for Payment Gateway Integration");

    // 10. AI Risks
    console.log("\n10. Inserting Detected AI Risks...");
    await pg.query(`DELETE FROM risks WHERE project_id = $1`, [projectId]);

    await pg.query(
      `
      INSERT INTO risks (
        project_id, task_id, title, description, probability,
        impact, status, mitigation, source, created_at, updated_at
      )
      VALUES
        (
          $1, $2, 'Payment Gateway Webhook Blocker',
          'Task has been blocked for >24 hours with external merchant dependency.',
          'high', 'high', 'open',
          'Coordinate with vendor technical contact or prepare sandbox mock environment to unblock UI testing.',
          'ai', NOW() - INTERVAL '20 hours', NOW()
        ),
        (
          $1, $2, 'Orders & Payment Sprint Deadline Proximity',
          'Sprint 2 contains critical path tasks with less than 50% completion due within 36 hours.',
          'medium', 'high', 'open',
          'Reallocate frontend resources from non-critical tasks to support checkout integration.',
          'ai', NOW() - INTERVAL '12 hours', NOW()
        )
      `,
      [projectId, paymentTaskId]
    );
    console.log("✓ AI Risks recorded with actionable mitigation recommendations");

    // 11. Activity Logs
    console.log("\n11. Generating Activity Logs...");
    await pg.query(
      `
      INSERT INTO activity_logs (organization_id, project_id, user_id, action, entity_type, entity_id, value, created_at)
      VALUES
        ($1, $3, $2, 'created', 'project', $3, 'Created project Online Food Delivery Platform', NOW() - INTERVAL '25 days'),
        ($1, $3, $2, 'created', 'sprint', $4, 'Created Sprint 2 - Orders & Payments', NOW() - INTERVAL '8 days'),
        ($1, $3, $2, 'updated', 'sprint', $4, 'Started Sprint 2 - Orders & Payments', NOW() - INTERVAL '7 days'),
        ($1, $3, $5, 'updated', 'task', $6, 'Blocked task Payment Gateway Integration: Waiting for gateway credentials', NOW() - INTERVAL '26 hours')
      `,
      [orgId, pmId, projectId, sprint2Id, dev2Id, paymentTaskId]
    );
    console.log("✓ Activity log history populated");

    console.log("\n=======================================================");
    console.log("🎉 SMART SPRINT AI MVP DEMO DATA SEEDED SUCCESSFULLY! 🎉");
    console.log("=======================================================");
    console.log("Demo Organization: SmartSprint Demo Organization");
    console.log("Project:           Online Food Delivery Platform");
    console.log("\nDemo User Credentials (Password: Password123!):");
    console.log("  1. ADMIN:            admin@smartsprint.ai");
    console.log("  2. PROJECT MANAGER:  pm@smartsprint.ai");
    console.log("  3. DEVELOPER 1:      dev1@smartsprint.ai");
    console.log("  4. DEVELOPER 2:      dev2@smartsprint.ai");
    console.log("  5. DEVELOPER 3:      dev3@smartsprint.ai");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("Error during seed:", err);
    throw err;
  } finally {
    await pg.end();
  }
}

runSeed();
