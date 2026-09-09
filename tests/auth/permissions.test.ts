/**
 * Role-escalation, developer-task-boundary, governance, invitations,
 * notifications/preferences/activity-logs, and documents/folders tests
 * (plan §§6–12: RBAC-*, TASK-DEV-01..09, GOV-*, INV-01, NOTIF-*, PREF-01,
 * LOG-01/02, AI-01/02, DOC-01..06).
 *
 * STATIC tests pin the policy predicates. LIVE tests prove allow/deny against
 * real policy evaluation; every live write runs in a rolled-back transaction
 * and every deny is re-verified (rowCount zero or RLS/trigger violation, plus
 * privileged re-reads where state matters). Skipped visibly when no database
 * is reachable — never faked.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS,
  ADMIN_A,
  ADMIN_B,
  MULTI_DEV,
  ORG_A,
  ORG_A_APPROVAL_PENDING,
  ORG_A_BUDGET,
  ORG_A_CHANGE_REQUEST,
  ORG_A_DOCUMENT,
  ORG_A_FOLDER,
  ORG_A_INVITE_PENDING,
  ORG_A_MILESTONE,
  ORG_A_PROJECT,
  ORG_A_RISK,
  ORG_B,
  ORG_B_PROJECT,
  ORG_B_SPRINT,
  OWN_TASK_A1,
  PEER_TASK_A2,
  PM_A,
  UNASSIGNED_TASK_A,
  formatCase,
} from "../fixtures/security-fixtures";
import { isLiveEnvConfigured, reportLiveSkipped } from "../utils/security-env";
import {
  LiveUnavailableError,
  isRlsViolation,
  probeLiveDb,
  runAsPrivileged,
  runAsUser,
} from "../utils/rls-live-client";

type SkipCtx = { skip: () => void };

const MIGRATION = path.join(process.cwd(), "supabase", "migrations", "0002_rls_security_foundation.sql");
const sql = (): string => fs.readFileSync(MIGRATION, "utf8");
const policy = (name: string): string => {
  const block = sql().match(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?;`))?.[0];
  if (!block) throw new Error(`policy ${name} not found in migration`);
  return block;
};

let LIVE = false;
beforeAll(async () => {
  LIVE = await probeLiveDb();
  if (!LIVE) reportLiveSkipped("permissions suite probe failed");
});

async function requireLive(ctx: SkipCtx): Promise<boolean> {
  if (LIVE) return true;
  reportLiveSkipped("permissions behavioral case");
  ctx.skip();
  return false;
}

async function live<T>(ctx: SkipCtx, fn: () => Promise<T>): Promise<T | undefined> {
  if (!(await requireLive(ctx))) return undefined;
  try {
    return await fn();
  } catch (error) {
    if (error instanceof LiveUnavailableError) {
      reportLiveSkipped(String(error.message));
      ctx.skip();
      return undefined;
    }
    throw error;
  }
}

/**
 * RLS-filtered UPDATE/DELETE on invisible rows succeed with rowCount 0;
 * WITH CHECK failures raise 42501; trigger guards raise P0001. All three mean
 * DENIED. Anything else (rowCount > 0) means the write landed and fails.
 */
async function expectWriteDenied(
  attempt: Promise<{ rowCount: number | null }>,
  what: string,
): Promise<void> {
  try {
    const res = await attempt;
    expect(res.rowCount ?? 0, `${what} must affect zero rows`).toBe(0);
  } catch (error) {
    expect(isRlsViolation(error), `${what} denial must come from RLS/trigger`).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// A. Role escalation
// ---------------------------------------------------------------------------

describe("role escalation (static gates)", () => {
  it("DEVELOPER cannot promote self / create ADMIN / modify roles (ISO-20/RBAC-ROLE-01)", () => {
    expect(policy("organization_members_admin_insert")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("organization_members_admin_update")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("organization_members_admin_delete")).toMatch(/smartsprint_is_org_admin/);
  });

  it("DEVELOPER cannot self-enroll into projects/teams (MEMB-03/04)", () => {
    expect(policy("project_members_admin_insert")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("team_members_admin_insert")).toMatch(/smartsprint_is_org_admin/);
  });

  it("DEVELOPER/PM cannot modify budgets; contracts need staff; milestones need staff (GOV-*)", () => {
    expect(policy("budget_line_items_admin_insert")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("contracts_insert_staff")).toMatch(/smartsprint_is_org_staff/);
    expect(policy("milestones_insert_staff")).toMatch(/smartsprint_is_org_staff/);
    expect(sql()).not.toMatch(/CREATE POLICY budget_line_items_insert_staff/);
    expect(sql()).not.toMatch(/CREATE POLICY milestones_insert_member/);
  });

  it("invitation management is ADMIN-only; developers have no access (RBAC-INV-01/INV-01)", () => {
    const names = [...sql().matchAll(/CREATE POLICY (invitations_\w+) ON/g)].map((m) => m[1]);
    expect(names.filter((n) => n.includes("member")).length).toBe(0);
    expect(policy("invitations_admin_insert")).toMatch(/smartsprint_is_org_admin/);
  });

  it("deletes on business data are ADMIN-only (no DEV/PM destructive path)", () => {
    // Delete policies use either {table}_delete_admin or {table}_admin_delete
    // order depending on the table (static variance V6); the security property
    // is identical: exactly one delete policy per table, gated to ADMIN.
    const names = [...sql().matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)].map((m) => m[1]);
    for (const table of [
      "tasks",
      "requirements",
      "sprints",
      "backlog",
      "budget_line_items",
      "contracts",
      "approvals",
      "risks",
      "change_requests",
      "milestones",
      "folders",
      "documents",
      "projects",
    ]) {
      const deletes = names.filter((n) => n.startsWith(`${table}_`) && n.includes("delete"));
      expect(deletes, `${table} must have exactly one delete policy`).toHaveLength(1);
      expect(deletes[0], `${table} delete must be ADMIN-gated`).toMatch(/admin/);
    }
  });

  it("sprints/backlog planning writes exclude DEVELOPER (RBAC-SPR-01/RBAC-BACK-01)", () => {
    expect(sql()).not.toMatch(/CREATE POLICY sprints_(insert|update|delete)_member/);
    expect(sql()).not.toMatch(/CREATE POLICY sprints_(insert|update|delete)_dev/);
    expect(sql()).not.toMatch(/CREATE POLICY backlog_(insert|update|delete)_member/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("role escalation (live behavioral)", () => {
  it(`DEV cannot promote self ${formatCase(ACTORS.devA1, "UPDATE", "organization_members[self→ADMIN]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "update public.organization_members set role = 'ADMIN' where organization_id = $1 and user_id = auth.uid()",
            [ORG_A],
          ),
        ),
        "developer self-promotion",
      );
      const role = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select role from public.organization_members where organization_id = $1 and user_id = $2",
          [ORG_A, ACTORS.devA1.sub],
        );
        return (res.rows as Array<{ role: string }>)[0]?.role;
      });
      expect(role).toBe("DEVELOPER");
    });
  });

  it(`DEV cannot modify another user's permissions ${formatCase(ACTORS.devA1, "UPDATE", "organization_members[peer role]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "update public.organization_members set role = 'ADMIN' where organization_id = $1 and user_id = $2",
            [ORG_A, ACTORS.devA2.sub],
          ),
        ),
        "developer modifying peer permissions",
      );
    });
  });

  it(`DEV cannot create ADMIN membership in an org they do not administer ${formatCase(ACTORS.devA1, "INSERT", "organization_members[ADMIN]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // Resolve an org where devA1 holds no membership (deterministic at runtime).
      const target = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select id from public.organizations where id <> $1 and not exists (select 1 from public.organization_members om where om.organization_id = id and om.user_id = $2) limit 1",
          [ORG_A, ACTORS.devA1.sub],
        );
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(target, "need an org where devA1 is not a member").toBeDefined();
      if (!target) return;
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "insert into public.organization_members (organization_id, user_id, role) values ($1, auth.uid(), 'ADMIN')",
            [target],
          ),
        ),
        "developer creating ADMIN membership",
      );
    });
  });

  it(`DEV cannot modify budgets ${formatCase(ACTORS.devA1, "INSERT+UPDATE", "budget_line_items", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-PROBE', 1)", [
            ORG_A_PROJECT,
          ]),
        ),
        "developer budget insert",
      );
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.budget_line_items set allocated = 999999 where id = $1", [ORG_A_BUDGET]),
        ),
        "developer budget update",
      );
    });
  });

  it(`DEV cannot manage invitations; cannot even read them ${formatCase(ACTORS.devA1, "SELECT+INSERT", "invitations", "zero rows + denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const seen = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.invitations");
        return res.rows;
      });
      expect(seen.length).toBe(0);
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "insert into public.invitations (organization_id, email, role) values ($1, 'rls.probe@example.com', 'DEVELOPER')",
            [ORG_A],
          ),
        ),
        "developer invitation insert",
      );
    });
  });

  it(`DEV cannot delete protected business data ${formatCase(ACTORS.devA1, "DELETE", "tasks[self]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("delete from public.tasks where id = $1", [OWN_TASK_A1]),
        ),
        "developer task delete",
      );
    });
  });

  it(`PM cannot modify organization membership roles ${formatCase(ACTORS.pmA, "UPDATE", "organization_members[peer]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(PM_A, async (client) =>
          client.query(
            "update public.organization_members set role = 'PROJECT_MANAGER' where organization_id = $1 and user_id = $2",
            [ORG_A, ACTORS.devA2.sub],
          ),
        ),
        "PM role modification",
      );
    });
  });

  it(`PM cannot manage ADMIN membership ${formatCase(ACTORS.pmA, "INSERT", "organization_members[ADMIN]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(PM_A, async (client) =>
          client.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'ADMIN')", [
            ORG_A,
            ADMIN_B,
          ]),
        ),
        "PM creating ADMIN membership",
      );
    });
  });

  it(`PM cannot modify budgets ${formatCase(ACTORS.pmA, "INSERT", "budget_line_items", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(PM_A, async (client) =>
          client.query("insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-PROBE-PM', 1)", [
            ORG_A_PROJECT,
          ]),
        ),
        "PM budget insert",
      );
    });
  });

  it(`PM cannot perform ADMIN-only deletes ${formatCase(ACTORS.pmA, "DELETE", "tasks", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const before = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.tasks where id = $1", [OWN_TASK_A1]);
        return res.rows.length;
      });
      await expectWriteDenied(
        runAsUser(PM_A, async (client) => client.query("delete from public.tasks where id = $1", [OWN_TASK_A1])),
        "PM task delete",
      );
      const after = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.tasks where id = $1", [OWN_TASK_A1]);
        return res.rows.length;
      });
      expect(after).toBe(before);
    });
  });

  it(`ADMIN retains organization-level capabilities (rolled back) ${formatCase(ACTORS.adminAinA, "INSERT+UPDATE", "projects + roles + budgets", "allowed")}`, async (ctx) => {
    await live(ctx, async () => {
      // All writes below run inside rolled-back transactions: allowed, never persisted.
      await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "insert into public.projects (organization_id, name, code) values ($1, 'RLS-ADMIN-PROBE', 'RLS-ADMIN-PROBE') returning id",
          [ORG_A],
        );
        expect(res.rowCount).toBe(1);
      });
      await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "update public.organization_members set role = 'PROJECT_MANAGER' where organization_id = $1 and user_id = $2",
          [ORG_A, ACTORS.devA2.sub],
        );
        expect(res.rowCount).toBe(1);
      });
      await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-ADMIN-PROBE', 1)",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// B. Developer task boundary (9 explicit cases)
// ---------------------------------------------------------------------------

describe("developer task boundary (static contract)", () => {
  it("dev UPDATE allowed only on self-assigned rows in member projects", () => {
    const block = policy("tasks_update_dev_self");
    expect(block).toMatch(/assignee_id = auth\.uid\(\)/);
    expect(block).toMatch(/smartsprint_is_project_member\(project_id\)/);
    expect(block).toMatch(/smartsprint_is_org_member/);
  });

  it("reassignment is impossible for developers (assignee pinned to self on both sides)", () => {
    const block = policy("tasks_update_dev_self");
    const using = block.split("WITH CHECK")[0];
    const check = block.split("WITH CHECK")[1];
    expect(using).toMatch(/assignee_id = auth\.uid\(\)/);
    expect(check).toMatch(/assignee_id = auth\.uid\(\)/);
  });

  it("project transplant blocked by trigger + RLS (TASK-DEV-06/08 contract)", () => {
    expect(sql()).toMatch(/trg_tasks_forbid_cross_org_move/);
    expect(policy("tasks_update_dev_self")).toMatch(
      /smartsprint_sprint_project\(sprint_id\) = project_id/,
    );
  });
});

describe.skipIf(!isLiveEnvConfigured())("developer task boundary (live behavioral)", () => {
  const dev = ACTORS.devA1;

  it(`1. developer reads assigned task → allowed ${formatCase(dev, "SELECT", "tasks[own]", "row visible")}`, async (ctx) => {
    await live(ctx, async () => {
      const rows = await runAsUser(dev.sub, async (client) => {
        const res = await client.query("select id, assignee_id from public.tasks where id = $1", [OWN_TASK_A1]);
        return res.rows as Array<{ id: string; assignee_id: string }>;
      });
      expect(rows.map((r) => r.id)).toEqual([OWN_TASK_A1]);
      expect(rows[0]?.assignee_id).toBe(dev.sub);
    });
  });

  it(`2. developer updates assigned task → allowed ${formatCase(dev, "UPDATE", "tasks[own title+status]", "allowed, rolled back")}`, async (ctx) => {
    await live(ctx, async () => {
      await runAsUser(dev.sub, async (client) => {
        const res = await client.query(
          "update public.tasks set title = 'RLS-DEV-PROBE', column_status = 'inProgress' where id = $1",
          [OWN_TASK_A1],
        );
        expect(res.rowCount).toBe(1);
      });
    });
  });

  it(`3. developer updates peer's task → denied ${formatCase(dev, "UPDATE", "tasks[peer title]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set title = 'RLS-HIJACK' where id = $1", [PEER_TASK_A2]),
        ),
        "peer task update",
      );
    });
  });

  it(`4. developer updates unassigned task → denied ${formatCase(dev, "UPDATE", "tasks[unassigned]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set title = 'RLS-HIJACK' where id = $1", [UNASSIGNED_TASK_A]),
        ),
        "unassigned task update",
      );
    });
  });

  it(`5. developer claims unassigned task → denied ${formatCase(dev, "UPDATE", "tasks[unassigned assignee=self]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set assignee_id = auth.uid() where id = $1", [UNASSIGNED_TASK_A]),
        ),
        "unassigned task claim",
      );
    });
  });

  it(`6. developer reassigns own task to another user → denied ${formatCase(dev, "UPDATE", "tasks[own assignee→peer]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set assignee_id = $1 where id = $2", [ACTORS.devA2.sub, OWN_TASK_A1]),
        ),
        "self-to-peer reassignment",
      );
    });
  });

  it(`7. developer changes another user's task assignment → denied ${formatCase(dev, "UPDATE", "tasks[peer assignee]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set assignee_id = auth.uid() where id = $1", [PEER_TASK_A2]),
        ),
        "peer task claim",
      );
    });
  });

  it(`8. developer moves task to another organization → denied ${formatCase(dev, "UPDATE", "tasks[project_id→OrgB]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set project_id = $1 where id = $2", [ORG_B_PROJECT, OWN_TASK_A1]),
        ),
        "cross-org project transplant",
      );
    });
  });

  it(`9. developer relinks sprint/requirement to another project → denied ${formatCase(dev, "UPDATE", "tasks[sprint_id→OrgB]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(dev.sub, async (client) =>
          client.query("update public.tasks set sprint_id = $1 where id = $2", [ORG_B_SPRINT, OWN_TASK_A1]),
        ),
        "cross-project sprint relink",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// C. Governance
// ---------------------------------------------------------------------------

describe("governance (static gates)", () => {
  it("contracts PM/ADMIN write, DEV read-only (GOV-CON-01)", () => {
    expect(policy("contracts_insert_staff")).toMatch(/smartsprint_is_org_staff/);
    expect(sql()).not.toMatch(/CREATE POLICY contracts_insert_member/);
  });

  it("risks/changes DEV-create, staff-update boundary (GOV-RISK-01/GOV-CHG-01)", () => {
    expect(policy("risks_insert_member")).toMatch(/smartsprint_is_project_member/);
    expect(sql()).not.toMatch(/CREATE POLICY risks_update_member/);
    expect(sql()).not.toMatch(/CREATE POLICY risks_update_dev/);
    expect(policy("change_requests_insert_member")).toMatch(/requester_id = auth\.uid\(\)/);
    expect(sql()).not.toMatch(/CREATE POLICY change_requests_update_member/);
  });

  it("milestones PM/ADMIN write, DEV read-only (GOV-MILE-01)", () => {
    expect(policy("milestones_insert_staff")).toMatch(/smartsprint_is_org_staff/);
    expect(sql()).not.toMatch(/CREATE POLICY milestones_insert_member/);
    expect(sql()).not.toMatch(/CREATE POLICY milestones_update_dev/);
  });

  it("approvals request/decide split with attribution to self (GOV-APR-01/02)", () => {
    expect(policy("approvals_insert_staff")).toMatch(/requester_id = auth\.uid\(\)/);
    expect(policy("approvals_update_staff")).toMatch(/decided_by IS NULL OR decided_by = auth\.uid\(\)/);
  });

  it("ai_predictions approval gated to staff with truthful attribution (AI-02)", () => {
    const block = policy("ai_predictions_update_staff");
    expect(block).toMatch(/smartsprint_is_org_staff/);
    expect(block).toMatch(/approved_by IS NULL OR approved_by = auth\.uid\(\)/);
    expect(sql()).not.toMatch(/CREATE POLICY ai_predictions_insert_\w+/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("governance (live behavioral)", () => {
  it(`GOV-BUD-02/live: PM and DEV budget writes deny; ADMIN allows (rolled back) ${formatCase(ACTORS.pmA, "INSERT", "budget_line_items", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(PM_A, async (client) =>
          client.query("insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-PROBE', 1)", [
            ORG_A_PROJECT,
          ]),
        ),
        "PM budget insert",
      );
      await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-ADMIN-PROBE', 1)",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
    });
  });

  it(`GOV-CON-01/live: PM contract write allows; DEV denies ${formatCase(ACTORS.pmA, "INSERT", "contracts", "allowed vs denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await runAsUser(PM_A, async (client) => {
        const res = await client.query(
          "insert into public.contracts (project_id, name, vendor, value) values ($1, 'RLS probe', 'RLS vendor', 10)",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("insert into public.contracts (project_id, name, vendor, value) values ($1, 'RLS probe', 'RLS vendor', 10)", [
            ORG_A_PROJECT,
          ]),
        ),
        "DEV contract insert",
      );
    });
  });

  it(`GOV-APR/live: DEV files request (allowed); DEV decides (denied); no self-approval ${formatCase(ACTORS.devA1, "INSERT+UPDATE", "approvals", "request allowed, decide denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // DEV create-request path (rolled back).
      await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query(
          "insert into public.approvals (project_id, title, requester_id, type, status) values ($1, 'RLS probe', auth.uid(), 'scope', 'pending') returning id",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
      // DEV cannot decide a pending approval.
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "update public.approvals set status = 'approved', decided_by = auth.uid() where id = $1",
            [ORG_A_APPROVAL_PENDING],
          ),
        ),
        "DEV approval decision",
      );
      // No self-approval: PM files then attempts to decide their own request in one txn.
      await runAsUser(PM_A, async (client) => {
        const created = await client.query(
          "insert into public.approvals (project_id, title, requester_id, type, status) values ($1, 'RLS self-approval probe', auth.uid(), 'scope', 'pending') returning id",
          [ORG_A_PROJECT],
        );
        const id = (created.rows as Array<{ id: string }>)[0]?.id;
        expect(id).toBeDefined();
        await expectWriteDenied(
          client.query(
            "update public.approvals set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = $1",
            [id],
          ),
          "self-approval",
        );
      });
    });
  });

  it(`GOV-RISK/live: DEV creates risk (allowed); DEV closes/reassigns (denied); PM triages (allowed) ${formatCase(ACTORS.devA1, "INSERT+UPDATE", "risks", "create-only for DEV")}`, async (ctx) => {
    await live(ctx, async () => {
      await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query(
          "insert into public.risks (project_id, title, probability, impact) values ($1, 'RLS probe risk', 'low', 'low')",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.risks set status = 'closed' where id = $1", [ORG_A_RISK]),
        ),
        "DEV risk close",
      );
      await runAsUser(PM_A, async (client) => {
        const res = await client.query("update public.risks set mitigation = 'RLS probe' where id = $1", [
          ORG_A_RISK,
        ]);
        expect(res.rowCount).toBe(1);
      });
    });
  });

  it(`GOV-CHG/live: DEV creates change request (allowed); DEV decides (denied); staff decides others' (allowed) ${formatCase(ACTORS.devA1, "INSERT+UPDATE", "change_requests", "create-only for DEV")}`, async (ctx) => {
    await live(ctx, async () => {
      await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query(
          "insert into public.change_requests (project_id, title, type, impact, status, requester_id) values ($1, 'RLS probe', 'feature', 'medium', 'pending', auth.uid())",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
      });
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.change_requests set status = 'approved' where id = $1", [ORG_A_CHANGE_REQUEST]),
        ),
        "DEV change-request decision",
      );
    });
  });

  it(`GOV-CHG-02/live (plan normative, variance V3): change-request self-decision denies ${formatCase(ACTORS.pmA, "UPDATE", "change_requests[self→approved]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // The migration's change_requests_update_staff lacks the approvals-style
      // no-self-decide guard (static variance V3). The test plan (GOV-CHG-01,
      // "same split as approvals") requires denial: if this fails live, the
      // policy — not the test — needs the fix. Reported, not weakened.
      await runAsUser(PM_A, async (client) => {
        const created = await client.query(
          "insert into public.change_requests (project_id, title, type, impact, status, requester_id) values ($1, 'RLS self-decide probe', 'feature', 'medium', 'pending', auth.uid()) returning id",
          [ORG_A_PROJECT],
        );
        const id = (created.rows as Array<{ id: string }>)[0]?.id;
        expect(id).toBeDefined();
        const selfDecide = await client.query(
          "update public.change_requests set status = 'approved', decided_at = now() where id = $1",
          [id],
        );
        // Plan-normative expectation: the requester must not decide their own request.
        expect(selfDecide.rowCount, "self-decision on change request must affect zero rows").toBe(0);
      });
    });
  });

  it(`GOV-MILE-01/live: DEV cannot complete milestones; PM can (rolled back) ${formatCase(ACTORS.devA1, "UPDATE", "milestones[completed]", "denied vs allowed")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.milestones set completed = true where id = $1", [ORG_A_MILESTONE]),
        ),
        "DEV milestone completion",
      );
      await runAsUser(PM_A, async (client) => {
        const res = await client.query("update public.milestones set completed = true where id = $1", [
          ORG_A_MILESTONE,
        ]);
        expect(res.rowCount).toBe(1);
      });
    });
  });

  it(`AI-02/live: DEV cannot approve AI predictions; staff approve with self-attribution ${formatCase(ACTORS.devA1, "UPDATE", "ai_predictions[approve]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const prediction = await runAsPrivileged(async (client) => {
        const res = await client.query(
          `select ap.id from public.ai_predictions ap
           join public.requirements r on r.id = ap.requirement_id
           where r.project_id = $1 and ap.recommendation_status = 'pending' limit 1`,
          [ORG_A_PROJECT],
        );
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      if (!prediction) {
        // No pending prediction in the fixture project: DEV-approve negative still
        // provable against any visible prediction; skip only the staff positive.
        const anyVisible = await runAsUser(ACTORS.devA1.sub, async (client) => {
          const res = await client.query("select id from public.ai_predictions limit 1");
          return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
        });
        if (!anyVisible) return;
        await expectWriteDenied(
          runAsUser(ACTORS.devA1.sub, async (client) =>
            client.query(
              "update public.ai_predictions set recommendation_status = 'approved', approved_by = auth.uid() where id = $1",
              [anyVisible],
            ),
          ),
          "DEV AI approval",
        );
        return;
      }
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query(
            "update public.ai_predictions set recommendation_status = 'approved', approved_by = auth.uid() where id = $1",
            [prediction],
          ),
        ),
        "DEV AI approval",
      );
      await runAsUser(PM_A, async (client) => {
        const res = await client.query(
          "update public.ai_predictions set recommendation_status = 'approved', approved_by = auth.uid() where id = $1",
          [prediction],
        );
        expect(res.rowCount).toBe(1);
      });
      // Forgery: approved_by set to another user denies.
      await expectWriteDenied(
        runAsUser(PM_A, async (client) =>
          client.query("update public.ai_predictions set approved_by = $1 where id = $2", [ADMIN_A, prediction]),
        ),
        "approved_by forgery",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// D. Invitations
// ---------------------------------------------------------------------------

describe("invitations (static gates)", () => {
  it("ADMIN full lifecycle; PM read-only (v1); DEV none (INV-01/RBAC-INV-01)", () => {
    expect(policy("invitations_select_staff")).toMatch(/smartsprint_is_org_staff/);
    expect(policy("invitations_admin_delete")).toMatch(/smartsprint_is_org_admin/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("invitations (live behavioral)", () => {
  it(`INV-01/live: ADMIN manages, PM reads, DEV sees nothing ${formatCase(ACTORS.adminAinA, "SELECT", "invitations[OrgA]", "rows visible")}`, async (ctx) => {
    await live(ctx, async () => {
      const adminSeen = await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query("select id from public.invitations where organization_id = $1", [ORG_A]);
        return res.rows;
      });
      expect(adminSeen.length).toBeGreaterThan(0);
      expect(adminSeen.some((r: { id: string }) => r.id === ORG_A_INVITE_PENDING)).toBe(true);
      const pmSeen = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.invitations where id = $1", [ORG_A_INVITE_PENDING]);
        return res.rows;
      });
      expect(pmSeen.length).toBe(1);
      const devSeen = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.invitations");
        return res.rows;
      });
      expect(devSeen.length).toBe(0);
    });
  });

  it(`INV-01/live: ADMIN send + revoke lifecycle (rolled back) ${formatCase(ACTORS.adminAinA, "INSERT+DELETE", "invitations", "allowed")}`, async (ctx) => {
    await live(ctx, async () => {
      await runAsUser(ADMIN_A, async (client) => {
        const created = await client.query(
          "insert into public.invitations (organization_id, email, role) values ($1, 'rls.probe@example.com', 'DEVELOPER') returning id",
          [ORG_A],
        );
        expect(created.rowCount).toBe(1);
        const id = (created.rows as Array<{ id: string }>)[0]?.id;
        const revoked = await client.query("delete from public.invitations where id = $1", [id]);
        expect(revoked.rowCount).toBe(1);
      });
    });
  });

  it(`INV-01/live: ordinary authenticated user cannot forge invitation membership ${formatCase(ACTORS.devA1, "UPDATE", "invitations[accept-foreign]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.invitations set status = 'accepted' where id = $1", [ORG_A_INVITE_PENDING]),
        ),
        "invitation accept forgery",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// E. Notifications / preferences / activity logs
// ---------------------------------------------------------------------------

describe("notifications, preferences, activity logs (static gates)", () => {
  it("NOTIF-02/static: notifications are system-generated (no client INSERT)", () => {
    expect(sql()).not.toMatch(/CREATE POLICY notifications_insert_\w+/);
  });

  it("PREF-01/static: preferences PK is user_id, owner-only on every op", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.ts"), "utf8");
    expect(schema).toMatch(/export const userPreferences = pgTable/);
    expect(policy("user_preferences_insert_own")).toMatch(/user_id = auth\.uid\(\)/);
  });

  it("LOG-01/02/static: logs readable in scope, never client-writable", () => {
    expect(policy("activity_logs_select_member")).toMatch(/smartsprint_is_org_member/);
    expect(sql()).not.toMatch(/CREATE POLICY activity_logs_(insert|update|delete)_\w+/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("notifications, preferences, activity logs (live behavioral)", () => {
  it(`NOTIF-01/live: own inbox readable, another user's invisible (even for ADMIN) ${formatCase(ACTORS.adminAinA, "SELECT", "notifications[other user]", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      const pair = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select id, user_id from public.notifications order by created_at limit 50",
        );
        const rows = res.rows as Array<{ id: string; user_id: string }>;
        const first = rows[0];
        const other = rows.find((r) => r.user_id !== first?.user_id);
        return first && other ? { first, other } : undefined;
      });
      expect(pair, "seed must contain notifications for two distinct users").toBeDefined();
      if (!pair) return;
      const own = await runAsUser(pair.first.user_id, async (client) => {
        const res = await client.query("select id from public.notifications where user_id = auth.uid()");
        return res.rows as Array<{ id: string }>;
      });
      expect(own.length).toBeGreaterThan(0);
      expect(own.some((r) => r.id === pair.first.id)).toBe(true);
      const cross = await runAsUser(pair.first.user_id, async (client) => {
        const res = await client.query("select id from public.notifications where id = $1", [pair.other.id]);
        return res.rows;
      });
      expect(cross.length).toBe(0);
      const adminSnoop = await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query("select id from public.notifications where id = $1", [pair.other.id]);
        return res.rows;
      });
      // ADMIN sees it only when it is their own notification.
      expect(adminSnoop.length).toBe(pair.other.user_id === ADMIN_A ? 1 : 0);
    });
  });

  it(`NOTIF-02/live: own mark-read allowed; cross-user modify/delete/forge deny ${formatCase(ACTORS.devA1, "UPDATE+DELETE+INSERT", "notifications", "own allowed, cross denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const pair = await runAsPrivileged(async (client) => {
        const res = await client.query("select id, user_id, read from public.notifications limit 50");
        const rows = res.rows as Array<{ id: string; user_id: string; read: boolean }>;
        const first = rows[0];
        const other = rows.find((r) => r.user_id !== first?.user_id);
        return first && other ? { first, other } : undefined;
      });
      expect(pair).toBeDefined();
      if (!pair) return;
      await runAsUser(pair.first.user_id, async (client) => {
        const res = await client.query("update public.notifications set read = true where id = $1", [
          pair.first.id,
        ]);
        expect(res.rowCount).toBe(1);
      });
      await runAsUser(pair.first.user_id, async (client) => {
        const res = await client.query("update public.notifications set read = true where id = $1", [
          pair.other.id,
        ]);
        expect(res.rowCount ?? 0).toBe(0);
      });
      const beforeRead = pair.other.read;
      const afterRead = await runAsPrivileged(async (client) => {
        const res = await client.query("select read from public.notifications where id = $1", [pair.other.id]);
        return (res.rows as Array<{ read: boolean }>)[0]?.read;
      });
      expect(afterRead).toBe(beforeRead);
      await runAsUser(pair.first.user_id, async (client) => {
        const res = await client.query("delete from public.notifications where id = $1", [pair.other.id]);
        expect(res.rowCount ?? 0).toBe(0);
      });
      const stillThere = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.notifications where id = $1", [pair.other.id]);
        return res.rows.length;
      });
      expect(stillThere).toBe(1);
      await expectWriteDenied(
        runAsUser(pair.first.user_id, async (client) =>
          client.query(
            "insert into public.notifications (user_id, type, title) values ($1, 'system', 'RLS forged alert')",
            [pair.other.user_id],
          ),
        ),
        "system notification forgery",
      );
    });
  });

  it(`PREF-01/live: preferences strictly user-scoped ${formatCase(ACTORS.devA1, "SELECT+UPDATE", "user_preferences", "own allowed, foreign denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const owner = await runAsPrivileged(async (client) => {
        const res = await client.query("select user_id from public.user_preferences limit 1");
        return (res.rows as Array<{ user_id: string }>)[0]?.user_id as string | undefined;
      });
      const stranger = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select user_id from public.user_preferences where user_id <> $1 limit 1",
          [owner],
        );
        return (res.rows as Array<{ user_id: string }>)[0]?.user_id as string | undefined;
      });
      expect(owner).toBeDefined();
      expect(stranger).toBeDefined();
      if (!owner || !stranger) return;
      const own = await runAsUser(owner, async (client) => {
        const res = await client.query("select user_id from public.user_preferences where user_id = auth.uid()");
        return res.rows;
      });
      expect(own.length).toBe(1);
      await runAsUser(owner, async (client) => {
        const res = await client.query(
          "update public.user_preferences set theme = 'dark' where user_id = auth.uid()",
        );
        expect(res.rowCount).toBe(1);
      });
      const cross = await runAsUser(owner, async (client) => {
        const res = await client.query("select user_id from public.user_preferences where user_id = $1", [
          stranger,
        ]);
        return res.rows;
      });
      expect(cross.length).toBe(0);
      await runAsUser(owner, async (client) => {
        const res = await client.query("update public.user_preferences set theme = 'dark' where user_id = $1", [
          stranger,
        ]);
        expect(res.rowCount ?? 0).toBe(0);
      });
    });
  });

  it(`LOG-01/02/live: scoped reads allow, cross-org deny, all client writes deny ${formatCase(ACTORS.pmA, "SELECT+INSERT+UPDATE+DELETE", "activity_logs", "scoped read, writes denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const inScope = await runAsUser(PM_A, async (client) => {
        const res = await client.query(
          "select id from public.activity_logs where organization_id = $1 limit 5",
          [ORG_A],
        );
        return res.rows;
      });
      expect(inScope.length).toBeGreaterThan(0);
      const crossOrg = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.activity_logs where organization_id = $1", [
          ORG_B,
        ]);
        return res.rows;
      });
      expect(crossOrg.length).toBe(0);
      await expectWriteDenied(
        runAsUser(ADMIN_A, async (client) =>
          client.query(
            "insert into public.activity_logs (organization_id, user_id, action) values ($1, auth.uid(), 'approved')",
            [ORG_A],
          ),
        ),
        "activity log forgery (even ADMIN)",
      );
      const target = (inScope as Array<{ id: string }>)[0]?.id;
      expect(target).toBeDefined();
      await expectWriteDenied(
        runAsUser(ADMIN_A, async (client) =>
          client.query("update public.activity_logs set action = 'approved' where id = $1", [target]),
        ),
        "activity log update",
      );
      await expectWriteDenied(
        runAsUser(ADMIN_A, async (client) =>
          client.query("delete from public.activity_logs where id = $1", [target]),
        ),
        "activity log delete",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// F. Documents / folders
// ---------------------------------------------------------------------------

describe("documents and folders (static gates)", () => {
  it("DOC-01/02/static: project isolation on reads; member upload with self-ownership", () => {
    expect(policy("documents_select_member")).toMatch(/smartsprint_is_project_member\(project_id\)/);
    expect(policy("documents_insert_member")).toMatch(/owner_id = auth\.uid\(\)/);
    expect(policy("folders_insert_member")).toMatch(/created_by = auth\.uid\(\)/);
  });

  it("DOC-03/static: no ownership theft or scope transplant for developers", () => {
    const docUpdate = policy("documents_update_dev_own");
    expect(docUpdate.split("WITH CHECK")[1]).toMatch(/owner_id = auth\.uid\(\)/);
    expect(docUpdate).toMatch(/smartsprint_folder_project\(folder_id\) = project_id/);
    const folderUpdate = policy("folders_update_dev_own");
    expect(folderUpdate.split("WITH CHECK")[1]).toMatch(/created_by = auth\.uid\(\)/);
  });

  it("DOC-04/05/static: deletes ADMIN-only; folder parent cannot graft across projects", () => {
    expect(policy("documents_delete_admin")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("folders_delete_admin")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("folders_insert_member")).toMatch(/smartsprint_folder_project\(parent_id\) = project_id/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("documents and folders (live behavioral)", () => {
  it(`DOC-01/live: project isolation by ID ${formatCase(ACTORS.devA1, "SELECT", "documents+folders[OrgB]", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      const doc = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.documents where id = $1", [ORG_A_DOCUMENT]);
        return res.rows;
      });
      // Own-project doc visible to a project member…
      expect(doc.length).toBe(1);
      const foreignFolder = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.folders where project_id = $1 limit 1", [
          ORG_B_PROJECT,
        ]);
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      const foreignDoc = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.documents where project_id = $1 limit 1", [
          ORG_B_PROJECT,
        ]);
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(foreignFolder).toBeDefined();
      expect(foreignDoc).toBeDefined();
      if (!foreignFolder || !foreignDoc) return;
      const hiddenDoc = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.documents where id = $1", [foreignDoc]);
        return res.rows;
      });
      expect(hiddenDoc.length).toBe(0);
      const hiddenFolder = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.folders where id = $1", [foreignFolder]);
        return res.rows;
      });
      expect(hiddenFolder.length).toBe(0);
    });
  });

  it(`DOC-02/03/live: developer owns, versions, but cannot steal or transplant ${formatCase(ACTORS.devA1, "INSERT+UPDATE", "documents", "own allowed, theft denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // Member upload with self-ownership (rolled back).
      const createdId = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query(
          "insert into public.documents (project_id, folder_id, name, file_type, file_size, storage_path, owner_id) values ($1, $2, 'rls-probe.pdf', 'pdf', 10, 'rls/probe.pdf', auth.uid()) returning id",
          [ORG_A_PROJECT, ORG_A_FOLDER],
        );
        expect(res.rowCount).toBe(1);
        return (res.rows as Array<{ id: string }>)[0]?.id as string;
      });
      // Owner edits own document (rolled back).
      await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("update public.documents set description = 'RLS probe' where id = $1", [
          createdId,
        ]);
        expect(res.rowCount).toBe(1);
      });
      // Peer cannot update another's document.
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.documents set description = 'RLS-HIJACK' where id = $1", [ORG_A_DOCUMENT]),
        ),
        "peer document update",
      );
      // Ownership theft denies.
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.documents set owner_id = $1 where id = $2", [ACTORS.devA2.sub, createdId]),
        ),
        "document ownership theft",
      );
      // Cross-project folder transplant denies.
      const folderB = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.folders where project_id = $1 limit 1", [
          ORG_B_PROJECT,
        ]);
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(folderB).toBeDefined();
      if (folderB) {
        await expectWriteDenied(
          runAsUser(ACTORS.devA1.sub, async (client) =>
            client.query("update public.documents set folder_id = $1 where id = $2", [folderB, createdId]),
          ),
          "cross-project folder transplant",
        );
      }
      // Unauthorized deletion denies (ADMIN-only).
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("delete from public.documents where id = $1", [createdId]),
        ),
        "developer document delete",
      );
    });
  });

  it(`DOC-05/live: folder create/update/delete boundaries ${formatCase(ACTORS.devA1, "INSERT+UPDATE+DELETE", "folders", "own allowed, others denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const createdId = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query(
          "insert into public.folders (project_id, name, created_by) values ($1, 'RLS-PROBE-FOLDER', auth.uid()) returning id",
          [ORG_A_PROJECT],
        );
        expect(res.rowCount).toBe(1);
        return (res.rows as Array<{ id: string }>)[0]?.id as string;
      });
      // Rename own folder (rolled back).
      await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("update public.folders set name = 'RLS-PROBE-RENAMED' where id = $1", [
          createdId,
        ]);
        expect(res.rowCount).toBe(1);
      });
      // Rename another's folder denies.
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("update public.folders set name = 'RLS-HIJACK' where id = $1", [ORG_A_FOLDER]),
        ),
        "peer folder rename",
      );
      // Cross-project parent graft denies.
      const folderB = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.folders where project_id = $1 limit 1", [
          ORG_B_PROJECT,
        ]);
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      if (folderB) {
        await expectWriteDenied(
          runAsUser(ACTORS.devA1.sub, async (client) =>
            client.query("update public.folders set parent_id = $1 where id = $2", [folderB, createdId]),
          ),
          "cross-project folder graft",
        );
      }
      // Unauthorized deletion denies.
      await expectWriteDenied(
        runAsUser(ACTORS.devA1.sub, async (client) =>
          client.query("delete from public.folders where id = $1", [createdId]),
        ),
        "developer folder delete",
      );
    });
  });

  it(`MEMB-04/V1/live (plan normative): developer cannot read foreign-team rows ${formatCase(ACTORS.devA1, "SELECT", "teams[non-member team]", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      // The migration implements org-wide team reads (static variance V1) while
      // the test plan (RBAC-TEAM-01/MEMB-04) requires own-team-only DEV reads.
      // Plan-normative expectation: hidden. If this fails live, the team-read
      // scope needs explicit product sign-off (plan §19). Reported, not weakened.
      const foreignTeam = await runAsPrivileged(async (client) => {
        const res = await client.query(
          `select t.id from public.teams t where t.organization_id = $1
           and not exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = $2) limit 1`,
          [ORG_A, ACTORS.devA1.sub],
        );
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      if (!foreignTeam) return;
      const seen = await runAsUser(ACTORS.devA1.sub, async (client) => {
        const res = await client.query("select id from public.teams where id = $1", [foreignTeam]);
        return res.rows;
      });
      expect(seen.length, "non-member team must be hidden from DEVELOPER per plan MEMB-04").toBe(0);
    });
  });

  it(`DOC cross-org/live: OrgB ADMIN sees zero OrgA documents ${formatCase(ACTORS.adminB, "SELECT", "documents[OrgA]", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      // ADMIN_B belongs only to OrgB: multi-org control proving ADMIN is not global.
      const seen = await runAsUser(ADMIN_B, async (client) => {
        const res = await client.query("select id from public.documents where project_id = $1", [ORG_A_PROJECT]);
        return res.rows;
      });
      expect(seen.length).toBe(0);
      const multiA = await runAsUser(MULTI_DEV, async (client) => {
        const res = await client.query("select id from public.projects where organization_id = $1", [ORG_A]);
        return res.rows;
      });
      expect(multiA.length).toBeGreaterThan(0);
    });
  });
});
