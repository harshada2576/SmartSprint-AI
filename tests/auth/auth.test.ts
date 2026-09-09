/**
 * Authentication security tests (plan §4: AUTH-01..08).
 *
 * STATIC tests (always run) pin the auth contract: org-scoped roles only,
 * signup/invite flows are trusted-lane operations, JWT identity is auth.uid().
 * LIVE tests (skipped without a reachable database) prove unauthenticated deny,
 * authenticated self-access, fail-closed outsiders, membership gating, and
 * per-organization role resolution against real policy evaluation.
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
  ORG_B,
  PM_A,
  formatCase,
} from "../fixtures/security-fixtures";
import { isLiveEnvConfigured, reportLiveSkipped } from "../utils/security-env";
import { LiveUnavailableError, probeLiveDb, runAsUser } from "../utils/rls-live-client";

const MIGRATION = path.join(process.cwd(), "supabase", "migrations", "0002_rls_security_foundation.sql");

let LIVE = false;
beforeAll(async () => {
  LIVE = await probeLiveDb();
  if (!LIVE) reportLiveSkipped("auth suite probe failed");
});

async function requireLive(ctx: { skip: () => void }): Promise<boolean> {
  if (LIVE) return true;
  reportLiveSkipped("auth behavioral case");
  ctx.skip();
  return false;
}

describe("authentication (static contract)", () => {
  it("AUTH-02/static: no global user role — users table has no role column", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.ts"), "utf8");
    const usersBlock = schema.match(/export const users = pgTable\("users", \{[\s\S]*?\}\)/)?.[0];
    expect(usersBlock).toBeDefined();
    expect(usersBlock).not.toMatch(/\brole\b/);
  });

  it("AUTH-02/static: new memberships default to DEVELOPER (no client-side ADMIN grant)", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.ts"), "utf8");
    const memberBlock = schema.match(
      /export const organizationMembers = pgTable\("organization_members", \{[\s\S]*?\}\)/,
    )?.[0];
    expect(memberBlock).toMatch(/default\('DEVELOPER'\)/);
  });

  it("AUTH-01/03/static: no auth.users signup trigger in RLS migration (provisioning is trusted-lane)", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).not.toMatch(/handle_new_user/i);
    expect(sql).toMatch(/trusted server lane|trusted server-lane/i);
  });

  it("AUTH-04/static: invitation acceptance runs in the trusted lane (invitee cannot self-grant)", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/Acceptance[\s\S]{0,300}?trusted/);
  });

  it("AUTH-07/static: every helper derives identity from auth.uid() (JWT sub), never from client fields", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/current_setting\('request\.jwt\.claims'[^)]*'email'/);
  });

  it("AUTH-05/06/static: fail-closed posture documented for missing membership / NULL identity", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/Fail-closed/);
    expect(sql).toMatch(/unknown\/missing membership -> deny/);
  });
});

describe.skipIf(!isLiveEnvConfigured())("authentication (live behavioral)", () => {
  it(`AUTH-07/live: unauthenticated (anon, NULL sub) reads deny ${formatCase(ACTORS.outsider, "SELECT", "organizations+projects+tasks", "zero rows")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      const counts = await runAsUser(null, async (client) => {
        const out: Record<string, number> = {};
        for (const [label, query] of [
          ["organizations", "select id from public.organizations"],
          ["projects", "select id from public.projects"],
          ["tasks", "select id from public.tasks"],
          ["notifications", "select id from public.notifications"],
          ["users", "select id from public.users"],
        ] as Array<[string, string]>) {
          const res = await client.query(query);
          out[label] = res.rowCount ?? 0;
        }
        return out;
      });
      for (const [table, n] of Object.entries(counts)) {
        expect(n, `anon must see zero ${table} rows`).toBe(0);
      }
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });

  it(`AUTH-05/live: outsider with zero memberships is fail-closed ${formatCase(ACTORS.outsider, "SELECT", "all business tables", "zero rows")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      const counts = await runAsUser(ACTORS.outsider.sub, async (client) => {
        const out: Record<string, number> = {};
        for (const [label, query] of [
          ["organizations", "select id from public.organizations"],
          ["organization_members", "select * from public.organization_members"],
          ["projects", "select id from public.projects"],
          ["tasks", "select id from public.tasks"],
          ["users-directory", "select id from public.users"],
          ["notifications", "select id from public.notifications"],
        ] as Array<[string, string]>) {
          const res = await client.query(query);
          out[label] = res.rowCount ?? 0;
        }
        return out;
      });
      for (const [table, n] of Object.entries(counts)) {
        expect(n, `outsider must see zero ${table} rows`).toBe(0);
      }
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });

  it(`AUTH-session/live: session identity resolves to the caller's own profile ${formatCase(ACTORS.adminAinA, "SELECT", "users where id=auth.uid()", "exactly own row")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      const rows = await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query("select id from public.users where id = auth.uid()");
        return res.rows as Array<{ id: string }>;
      });
      expect(rows.map((r) => r.id)).toEqual([ADMIN_A]);
      // A different authenticated identity resolves to a different self-row (no bleed).
      const pmRows = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.users where id = auth.uid()");
        return res.rows as Array<{ id: string }>;
      });
      expect(pmRows.map((r) => r.id)).toEqual([PM_A]);
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });

  it(`AUTH-membership/live: non-member sees zero foreign-org memberships ${formatCase(ACTORS.pmA, "SELECT", "organization_members[OrgB]", "zero rows")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      const orgBRows = await runAsUser(PM_A, async (client) => {
        const res = await client.query(
          "select * from public.organization_members where organization_id = $1",
          [ORG_B],
        );
        return res.rows;
      });
      expect(orgBRows.length).toBe(0);
      const orgARows = await runAsUser(PM_A, async (client) => {
        const res = await client.query(
          "select * from public.organization_members where organization_id = $1",
          [ORG_A],
        );
        return res.rows as Array<{ user_id: string }>;
      });
      expect(orgARows.length).toBeGreaterThan(0);
      expect(orgARows.some((r) => r.user_id === PM_A)).toBe(true);
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });

  it(`AUTH-role/live: same user resolves to ADMIN in OrgA and DEVELOPER in OrgB ${formatCase(ACTORS.adminAinA, "SELECT", "organization_members[self]", "ADMIN@A + DEVELOPER@B")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      const rows = await runAsUser(ADMIN_A, async (client) => {
        const res = await client.query(
          "select organization_id, role from public.organization_members where user_id = auth.uid() order by organization_id",
        );
        return res.rows as Array<{ organization_id: string; role: string }>;
      });
      const byOrg = new Map(rows.map((r) => [r.organization_id, r.role]));
      expect(byOrg.get(ORG_A)).toBe("ADMIN");
      expect(byOrg.get(ORG_B)).toBe("DEVELOPER");
      // Cross-check: OrgB ADMIN fixture is a different human with ADMIN only in OrgB.
      const adminBRows = await runAsUser(ADMIN_B, async (client) => {
        const res = await client.query(
          "select organization_id, role from public.organization_members where user_id = auth.uid()",
        );
        return res.rows as Array<{ organization_id: string; role: string }>;
      });
      expect(adminBRows).toEqual([{ organization_id: ORG_B, role: "ADMIN" }]);
      // Multi-org user holds DEVELOPER in every org (no blending of authority).
      const multiRows = await runAsUser(MULTI_DEV, async (client) => {
        const res = await client.query(
          "select role from public.organization_members where user_id = auth.uid()",
        );
        return res.rows as Array<{ role: string }>;
      });
      expect(multiRows.length).toBeGreaterThanOrEqual(3);
      expect(new Set(multiRows.map((r) => r.role))).toEqual(new Set(["DEVELOPER"]));
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });

  it(`AUTH-users-dir/live: users directory is org-gated, no cross-org enumeration ${formatCase(ACTORS.pmA, "SELECT", "users[OrgB-only]", "zero rows")}`, async (ctx) => {
    if (!(await requireLive(ctx))) return;
    try {
      // ADMIN_B belongs only to OrgB; PM_A (OrgA only) shares no org with them.
      const rows = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.users where id = $1", [ADMIN_B]);
        return res.rows;
      });
      expect(rows.length).toBe(0);
      // Positive control: teammate in the same org is visible.
      const teammate = await runAsUser(PM_A, async (client) => {
        const res = await client.query("select id from public.users where id = $1", [ADMIN_A]);
        return res.rows as Array<{ id: string }>;
      });
      expect(teammate.map((r) => r.id)).toEqual([ADMIN_A]);
    } catch (error) {
      if (error instanceof LiveUnavailableError) {
        reportLiveSkipped(String(error.message));
        ctx.skip();
      }
      throw error;
    }
  });
});
