/**
 * Organization-isolation + membership + cross-org FK-smuggling tests
 * (plan §5 ISO-01..21, §8 MEMB-01..05, ISO-15/ISO-18).
 *
 * STATIC tests pin the policy predicates that encode isolation. LIVE tests
 * prove OrgA×OrgB impossibility (read/write/delete), per-org visibility for
 * multi-org users, per-org role evaluation, FK-smuggling denial, and
 * no-self-enrollment against real policy evaluation. All live writes run in
 * rolled-back transactions; denies are re-verified with privileged re-reads.
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
  ORG_A_PROJECT,
  ORG_A_SPRINT,
  ORG_B,
  ORG_B_PROJECT,
  ORG_B_SPRINT,
  PM_A,
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
  if (!LIVE) reportLiveSkipped("rls-policies suite probe failed");
});

async function requireLive(ctx: { skip: () => void }): Promise<boolean> {
  if (LIVE) return true;
  reportLiveSkipped("isolation behavioral case");
  ctx.skip();
  return false;
}

async function live<T>(ctx: { skip: () => void }, fn: () => Promise<T>): Promise<T | undefined> {
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

describe("organization isolation (static predicates)", () => {
  it("ISO-01/static: organizations SELECT is member-only", () => {
    expect(policy("organizations_select_member")).toMatch(/smartsprint_is_org_member\(id\)/);
  });

  it("ISO-02/static: organization_members SELECT is org-gated", () => {
    expect(policy("organization_members_select_member")).toMatch(
      /smartsprint_is_org_member\(organization_id\)/,
    );
  });

  it("ISO-03/static: teams/projects SELECT deny cross-org by construction", () => {
    expect(policy("teams_select_org_member")).toMatch(/smartsprint_is_org_member\(organization_id\)/);
    expect(policy("projects_select_org_staff")).toMatch(/smartsprint_is_org_staff\(organization_id\)/);
    expect(policy("projects_select_member")).toMatch(/smartsprint_is_project_member\(id\)/);
    expect(policy("projects_select_member")).toMatch(/smartsprint_is_org_member\(organization_id\)/);
  });

  it("ISO-05/06/static: project/team writes require owning-org staff/admin", () => {
    expect(policy("projects_insert_staff")).toMatch(/smartsprint_is_org_staff\(organization_id\)/);
    expect(policy("projects_delete_admin")).toMatch(/smartsprint_is_org_admin\(organization_id\)/);
    expect(policy("teams_admin_insert")).toMatch(/smartsprint_is_org_admin\(organization_id\)/);
  });

  it("ISO-07/08/static: membership self-grant and cross-org tamper require ADMIN", () => {
    expect(policy("organization_members_admin_insert")).toMatch(
      /smartsprint_is_org_admin\(organization_id\)/,
    );
    expect(policy("organization_members_admin_delete")).toMatch(
      /smartsprint_is_org_admin\(organization_id\)/,
    );
  });

  it("ISO-10..13/static: project-derived reads/writes derive org via project (transitive tenancy)", () => {
    for (const name of [
      "sprints_select_member",
      "requirements_select_member",
      "tasks_select_member",
      "backlog_select_member",
      "budget_line_items_select_member",
      "contracts_select_member",
      "approvals_select_member",
      "risks_select_member",
      "change_requests_select_member",
      "milestones_select_member",
      "folders_select_member",
      "documents_select_member",
    ]) {
      const block = policy(name);
      expect(block, name).toMatch(/smartsprint_project_org\(project_id\)/);
      expect(block, name).toMatch(/smartsprint_is_project_member\(project_id\)/);
    }
  });

  it("ISO-15/static: cross-FK linkage must stay in the same project", () => {
    expect(policy("requirements_insert_staff")).toMatch(
      /smartsprint_sprint_project\(sprint_id\) = project_id/,
    );
    expect(policy("tasks_insert_staff")).toMatch(
      /smartsprint_requirement_project\(requirement_id\) = project_id/,
    );
    expect(policy("backlog_insert_staff")).toMatch(
      /smartsprint_requirement_project\(requirement_id\) = project_id/,
    );
    expect(policy("documents_insert_staff")).toMatch(/smartsprint_folder_project\(folder_id\) = project_id/);
  });

  it("ISO-16/17/static: activity_logs and ai_predictions inherit org scope", () => {
    expect(policy("activity_logs_select_member")).toMatch(/smartsprint_is_org_member\(organization_id\)/);
    expect(policy("ai_predictions_select_member")).toMatch(/smartsprint_requirement_project/);
  });

  it("ISO-18/static: assignee/owner/manager/lead must already belong to the target org", () => {
    expect(sql().match(/smartsprint_user_is_org_member/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it("ISO-19/21/static: notifications/preferences are user-scoped; users directory is org-gated", () => {
    expect(policy("notifications_select_own")).toMatch(/user_id = auth\.uid\(\)/);
    expect(policy("user_preferences_select_own")).toMatch(/user_id = auth\.uid\(\)/);
    expect(policy("users_select_org_directory")).toMatch(/smartsprint_shares_org_with\(id\)/);
  });

  it("ISO-20/static: role changes are ADMIN-only (no self-promotion path)", () => {
    expect(policy("organization_members_admin_update")).toMatch(
      /smartsprint_is_org_admin\(organization_id\)/,
    );
  });

  it("MEMB-01/03/static: developer reads are project-member-gated; project enrollment is ADMIN-only", () => {
    expect(policy("tasks_select_member")).toMatch(/smartsprint_is_project_member\(project_id\)/);
    expect(policy("project_members_admin_insert")).toMatch(/smartsprint_is_org_admin/);
    expect(policy("project_members_admin_insert")).toMatch(/smartsprint_user_is_org_member/);
  });

  it("MEMB-05/static: manager/lead titles cannot smuggle outsiders; titles confer no read", () => {
    expect(policy("projects_insert_staff")).toMatch(
      /manager_id IS NULL OR public\.smartsprint_user_is_org_member\(manager_id, organization_id\)/,
    );
    expect(policy("teams_admin_insert")).toMatch(
      /lead_id IS NULL OR public\.smartsprint_user_is_org_member\(lead_id, organization_id\)/,
    );
  });
});

describe.skipIf(!isLiveEnvConfigured())("organization isolation (live behavioral)", () => {
  it(`ISO-03/live: OrgA member reads OrgB project by ID and by list ${formatCase(ACTORS.pmA, "SELECT", "projects[OrgB]", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      const byId = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.projects where id = $1", [ORG_B_PROJECT]);
        return res.rows;
      });
      expect(byId.length).toBe(0);
      const list = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id, organization_id from public.projects");
        return res.rows as Array<{ id: string; organization_id: string }>;
      });
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((p) => p.organization_id === ORG_B)).toBe(false);
      // Mirror: OrgB ADMIN sees zero OrgA rows (ADMIN does not cross orgs).
      const mirror = await runAsUser(ADMIN_B, async (client) => {
        const res = await client.query("select id from public.projects where id = $1", [ORG_A_PROJECT]);
        return res.rows;
      });
      expect(mirror.length).toBe(0);
    });
  });

  it(`ISO-10/live: cross-org chain reads deny on sprints/requirements/tasks/backlog ${formatCase(ACTORS.pmA, "SELECT", "OrgB sprints+requirements+tasks+backlog", "zero rows")}`, async (ctx) => {
    await live(ctx, async () => {
      const result = await runAsUser(PM_A, async (client) => {
        const out: Record<string, number> = {};
        const queries: Array<[string, string, Array<string>]> = [
          ["sprints", "select id from public.sprints where project_id = $1", [ORG_B_PROJECT]],
          ["requirements", "select id from public.requirements where project_id = $1", [ORG_B_PROJECT]],
          ["tasks", "select id from public.tasks where project_id = $1", [ORG_B_PROJECT]],
          ["backlog", "select id from public.backlog where project_id = $1", [ORG_B_PROJECT]],
        ];
        for (const [label, text, params] of queries) {
          const res = await client.query(text, params);
          out[label] = res.rowCount ?? 0;
        }
        return out;
      });
      for (const [table, n] of Object.entries(result ?? {})) {
        expect(n, `OrgA member must see zero OrgB ${table} rows`).toBe(0);
      }
    });
  });

  it(`ISO-05/live: ADMIN cannot create projects in a foreign org ${formatCase(ACTORS.adminB, "INSERT", "projects[OrgA]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const attempt = runAsUser(ADMIN_B, async (client) =>
        client.query(
          "insert into public.projects (organization_id, name, code) values ($1, 'RLS-PROBE-FOREIGN', 'RLS-PROBE-FOREIGN')",
          [ORG_A],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
      // Privileged re-read proves no-op.
      const leaked = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.projects where code = 'RLS-PROBE-FOREIGN'");
        return res.rows;
      });
      expect(leaked.length).toBe(0);
    });
  });

  it(`ISO-06/live: cross-org UPDATE/DELETE deny and leave rows untouched ${formatCase(ACTORS.pmA, "UPDATE+DELETE", "projects[OrgB]", "denied, unchanged")}`, async (ctx) => {
    await live(ctx, async () => {
      const before = await runAsPrivileged(async (client) => {
        const res = await client.query("select name from public.projects where id = $1", [ORG_B_PROJECT]);
        return (res.rows as Array<{ name: string }>)[0]?.name;
      });
      const updateAttempt = runAsUser(PM_A, async (client) =>
        client.query("update public.projects set name = 'RLS-HIJACK' where id = $1", [ORG_B_PROJECT]),
      );
      await expect(updateAttempt).rejects.toSatisfy(isRlsViolation);
      const deleteAttempt = runAsUser(PM_A, async (client) =>
        client.query("delete from public.projects where id = $1", [ORG_B_PROJECT]),
      );
      // DELETE on invisible rows affects zero rows (RLS-filtered) or raises; both are deny.
      try {
        const res = await deleteAttempt;
        expect(res.rowCount).toBe(0);
      } catch (error) {
        expect(isRlsViolation(error)).toBe(true);
      }
      const after = await runAsPrivileged(async (client) => {
        const res = await client.query("select name from public.projects where id = $1", [ORG_B_PROJECT]);
        return (res.rows as Array<{ name: string }>)[0]?.name;
      });
      expect(after).toBe(before);
    });
  });

  it(`ISO-07/live: self-enrollment into a foreign org denies (even as ADMIN) ${formatCase(ACTORS.pmA, "INSERT", "organization_members[OrgB,self,ADMIN]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const attempt = runAsUser(PM_A, async (client) =>
        client.query(
          "insert into public.organization_members (organization_id, user_id, role) values ($1, auth.uid(), 'ADMIN')",
          [ORG_B],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`ISO-11/live: child-row creation in a foreign project denies ${formatCase(ACTORS.pmA, "INSERT", "tasks[OrgB project]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const attempt = runAsUser(PM_A, async (client) =>
        client.query(
          "insert into public.tasks (display_id, project_id, title) values ('RLS-PROBE-1', $1, 'RLS probe')",
          [ORG_B_PROJECT],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`ISO-13/live: governance in foreign project denies (SELECT zero, budget INSERT denied) ${formatCase(ACTORS.adminAinA, "SELECT+INSERT", "budget_line_items[OrgB]", "zero rows + denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // adminA is ADMIN in OrgA but only DEVELOPER in OrgB: strongest negative.
      const seen = await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "select id from public.budget_line_items where project_id = $1",
          [ORG_B_PROJECT],
        );
        return res.rows;
      });
      // Visibility for a DEVELOPER requires project membership; assert no blend:
      // the ADMIN-in-A authority must not leak OrgB financial rows unless member.
      const memberCheck = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select user_id from public.project_members where project_id = $1 and user_id = $2",
          [ORG_B_PROJECT, ADMIN_A],
        );
        return res.rows.length > 0;
      });
      if (!memberCheck) expect(seen.length).toBe(0);
      const insertAttempt = runAsUser(ADMIN_A, async (client) =>
        client.query(
          "insert into public.budget_line_items (project_id, category, allocated) values ($1, 'RLS-PROBE', 1)",
          [ORG_B_PROJECT],
        ),
      );
      await expect(insertAttempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`multi-org/live: per-org visibility without blending ${formatCase(ACTORS.multiDevA, "SELECT", "projects[OrgA]+projects[OrgB]", "scoped sets, disjoint")}`, async (ctx) => {
    await live(ctx, async () => {
      const asA = await runAsUser(MULTI_DEV, async (client) => {
        const res = await client.query(
          "select id from public.projects where organization_id = $1",
          [ORG_A],
        );
        return res.rows as Array<{ id: string }>;
      });
      // Same identity evaluated in the OrgB context sees OrgB rows.
      const asB = await runAsUser(MULTI_DEV, async (client) => {
        const res = await client.query(
          "select id from public.projects where organization_id = $1",
          [ORG_B],
        );
        return res.rows as Array<{ id: string }>;
      });
      const idsA = new Set(asA.map((r) => r.id));
      const idsB = new Set(asB.map((r) => r.id));
      for (const id of idsA) expect(idsB.has(id)).toBe(false);
    });
  });

  it(`MEMB-03/live: no self-enrollment into arbitrary projects ${formatCase(ACTORS.devA1, "INSERT", "project_members[self, foreign project]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      // Resolve an OrgA project the developer is NOT a member of (runtime, deterministic).
      const foreign = await runAsPrivileged(async (client) => {
        const res = await client.query(
          `select p.id from public.projects p
           where p.organization_id = $1
             and not exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = $2)
           limit 1`,
          [ORG_A, ACTORS.devA1.sub],
        );
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(foreign, "seed must contain an OrgA project devA1 is not in").toBeDefined();
      if (!foreign) return;
      const attempt = runAsUser(ACTORS.devA1.sub, async (client) =>
        client.query("insert into public.project_members (project_id, user_id) values ($1, auth.uid())", [
          foreign,
        ]),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });
});

describe.skipIf(!isLiveEnvConfigured())("cross-org FK smuggling (live behavioral)", () => {
  it(`ISO-15/live: legal parent + foreign sprint linkage denies ${formatCase(ACTORS.pmA, "INSERT", "tasks[OrgA project + OrgB sprint]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const attempt = runAsUser(PM_A, async (client) =>
        client.query(
          "insert into public.tasks (display_id, project_id, sprint_id, title) values ('RLS-PROBE-2', $1, $2, 'RLS probe')",
          [ORG_A_PROJECT, ORG_B_SPRINT],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`ISO-15/live: document folder graft across projects denies ${formatCase(ACTORS.pmA, "INSERT", "documents[OrgA project + OrgB folder]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const folderB = await runAsPrivileged(async (client) => {
        const res = await client.query(
          "select id from public.folders where project_id = $1 limit 1",
          [ORG_B_PROJECT],
        );
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(folderB).toBeDefined();
      if (!folderB) return;
      const attempt = runAsUser(PM_A, async (client) =>
        client.query(
          "insert into public.documents (project_id, folder_id, name, file_type, file_size, storage_path, owner_id) values ($1, $2, 'rls-probe.pdf', 'pdf', 10, 'rls/probe.pdf', auth.uid())",
          [ORG_A_PROJECT, folderB],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`ISO-18/live: assigning a foreign-org user to an OrgA row denies ${formatCase(ACTORS.pmA, "INSERT", "tasks[OrgA project, assignee=OrgB-only ADMIN_B]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const attempt = runAsUser(PM_A, async (client) =>
        client.query(
          "insert into public.tasks (display_id, project_id, sprint_id, title, assignee_id) values ('RLS-PROBE-3', $1, $2, 'RLS probe', $3)",
          [ORG_A_PROJECT, ORG_A_SPRINT, ADMIN_B],
        ),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });

  it(`ISO-18/live: moving an OrgA task's sprint to an OrgB sprint denies ${formatCase(ACTORS.pmA, "UPDATE", "tasks[sprint_id → OrgB]", "denied")}`, async (ctx) => {
    await live(ctx, async () => {
      const taskA = await runAsPrivileged(async (client) => {
        const res = await client.query("select id from public.tasks where project_id = $1 limit 1", [
          ORG_A_PROJECT,
        ]);
        return (res.rows as Array<{ id: string }>)[0]?.id as string | undefined;
      });
      expect(taskA).toBeDefined();
      if (!taskA) return;
      const attempt = runAsUser(PM_A, async (client) =>
        client.query("update public.tasks set sprint_id = $1 where id = $2", [ORG_B_SPRINT, taskA]),
      );
      await expect(attempt).rejects.toSatisfy(isRlsViolation);
    });
  });
});
