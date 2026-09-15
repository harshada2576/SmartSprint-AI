/**
 * RLS security-foundation contract tests (STATIC — no database required).
 *
 * Validates supabase/migrations/0002_rls_security_foundation.sql against the
 * normative contract in docs/database/auth-rls-test-plan.md WITHOUT executing
 * RLS behavior. These tests prove the migration text contains the required
 * controls; they do NOT prove PostgreSQL enforces them. Behavioral proof lives
 * in the live suites (tests/auth/*), which require a reachable database and
 * report LIVE RLS BEHAVIORAL TESTS NOT EXECUTED when none is available.
 *
 * Traceability: plan §§1–3, 5–7, 9–12, 15–16 (P0 contract gates).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeedTable, seedMembershipRole } from "../fixtures/security-fixtures";
import { isLiveEnvConfigured, reportLiveSkipped } from "../utils/security-env";
import { probeLiveDb } from "../utils/rls-live-client";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "0002_rls_security_foundation.sql",
);
const SCHEMA_PATH = path.join(process.cwd(), "supabase", "schema.ts");

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf8");
}

const EXPECTED_TABLES = [
  "organizations",
  "organization_members",
  "users",
  "teams",
  "team_members",
  "projects",
  "project_members",
  "invitations",
  "sprints",
  "requirements",
  "backlog",
  "tasks",
  "ai_predictions",
  "activity_logs",
  "notifications",
  "budget_line_items",
  "contracts",
  "approvals",
  "risks",
  "change_requests",
  "milestones",
  "folders",
  "documents",
  "user_preferences",
];

const EXPECTED_HELPERS = [
  "smartsprint_is_org_member",
  "smartsprint_is_org_admin",
  "smartsprint_is_org_staff",
  "smartsprint_user_is_org_member",
  "smartsprint_shares_org_with",
  "smartsprint_is_user_org_admin",
  "smartsprint_project_org",
  "smartsprint_team_org",
  "smartsprint_sprint_project",
  "smartsprint_requirement_project",
  "smartsprint_folder_project",
  "smartsprint_is_project_member",
];

const EXPECTED_TRIGGER_FUNCTIONS = [
  "smartsprint_forbid_organization_change",
  "smartsprint_forbid_cross_org_project_move",
  "smartsprint_ai_prediction_guard",
  "smartsprint_protect_organization_members",
  "smartsprint_forbid_user_id_change",
];

describe("RLS foundation contract (static)", () => {
  describe("RLS-01: RLS enabled on all 24 application tables", () => {
    it("migration file exists and is non-empty", () => {
      expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
      expect(readMigration().length).toBeGreaterThan(10_000);
    });

    it("every application table has ALTER TABLE … ENABLE ROW LEVEL SECURITY", () => {
      const sql = readMigration();
      const enabled = new Set(
        [...sql.matchAll(/ALTER TABLE public\.(\w+)\s+ENABLE ROW LEVEL SECURITY/g)].map(
          (m) => m[1],
        ),
      );
      for (const table of EXPECTED_TABLES) {
        expect(
          enabled.has(table),
          `RLS not enabled on public.${table} (fail-open without this)`,
        ).toBe(true);
      }
      expect(enabled.size).toBe(EXPECTED_TABLES.length);
    });

    it("uses ENABLE (not FORCE): privileged lanes keep working, anon/authenticated are filtered", () => {
      const sql = readMigration();
      expect(sql).toMatch(/ENABLE \(not FORCE\)/);
      expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/);
    });
  });

  describe("RLS-02: 12 authorization helpers, SECURITY DEFINER, pinned search_path", () => {
    it("all 12 helpers are defined exactly once", () => {
      const sql = readMigration();
      for (const helper of EXPECTED_HELPERS) {
        const occurrences = (
          sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\b`, "g")) ?? []
        ).length;
        expect(occurrences, `helper ${helper} must be defined exactly once`).toBe(1);
      }
    });

    it("every helper is STABLE + SECURITY DEFINER with SET search_path = public", () => {
      const sql = readMigration();
      for (const helper of EXPECTED_HELPERS) {
        const block = sql.match(
          new RegExp(
            `CREATE OR REPLACE FUNCTION public\\.${helper}[\\s\\S]{0,400}?SET search_path = public`,
          ),
        );
        expect(block, `${helper} must pin search_path (anti-hijack)`).not.toBeNull();
        expect(block?.[0]).toMatch(/SECURITY DEFINER/);
        expect(block?.[0]).toMatch(/STABLE/);
      }
    });

    it("authorization reads organization_members.role only — no global users.role", () => {
      const sql = readMigration();
      // Strip line comments: the header legitimately documents that users.role
      // does NOT exist ("There is intentionally NO ... NO users.role column").
      const codeOnly = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
      expect(codeOnly).toMatch(/organization_members\.role|om\.role|m1\.role/);
      // No executable reference to a users.role column (it does not exist).
      expect(codeOnly).not.toMatch(/users\.role/);
      const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
      const usersBlock = schema.match(/export const users = pgTable\("users", \{[\s\S]*?\}\)/);
      expect(usersBlock?.[0]).not.toMatch(/\brole\b/);
    });

    it("fail-closed semantics documented: NULL auth.uid() and missing membership deny", () => {
      const sql = readMigration();
      expect(sql).toMatch(/Fail-closed/);
      expect(sql).toMatch(/NULL auth\.uid\(\).*deny|NULL -> (fail-closed|deny)/);
    });
  });

  describe("RLS-03: 111 policies, idempotent, naming convention", () => {
    it("exactly 111 CREATE POLICY statements with unique names", () => {
      const sql = readMigration();
      const creates = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)];
      expect(creates.length).toBe(111);
      expect(new Set(creates.map((m) => m[1])).size).toBe(111);
    });

    it("every policy is dropped before creation (safe re-run)", () => {
      const sql = readMigration();
      const creates = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)].map((m) => m[1]);
      for (const name of creates) {
        expect(
          sql.includes(`DROP POLICY IF EXISTS ${name} ON`),
          `policy ${name} missing idempotent DROP`,
        ).toBe(true);
      }
    });

    it("policy names are deterministic: prefixed by their table and carry one op token", () => {
      const sql = readMigration();
      const policies = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)];
      for (const [, name, table] of policies) {
        expect(name, `policy ${name} must be prefixed by its table`).toMatch(
          new RegExp(`^${table}_`),
        );
        const ops = (name.match(/select|insert|update|delete/g) ?? []).filter(
          (op) => name.includes(`_${op}_`) || name.endsWith(`_${op}`),
        );
        expect(ops, `policy ${name} must carry exactly one op token`).toHaveLength(1);
      }
    });

    it("no unrestricted policies (no USING(true) / WITH CHECK(true) backdoors)", () => {
      const sql = readMigration();
      expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(sql).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    });
  });

  describe("RLS-04: integrity triggers (apply to every role incl. service_role)", () => {
    it("all 5 trigger functions exist with pinned search_path", () => {
      const sql = readMigration();
      for (const fn of EXPECTED_TRIGGER_FUNCTIONS) {
        expect(
          sql.includes(`FUNCTION public.${fn}()`),
          `trigger function ${fn} missing`,
        ).toBe(true);
      }
    });

    it("organization_id immutability triggers on projects/teams/invitations", () => {
      const sql = readMigration();
      for (const table of ["projects", "teams", "invitations"]) {
        expect(sql).toMatch(
          new RegExp(`TRIGGER trg_${table}_forbid_org_change[\\s\\S]{0,200}?BEFORE UPDATE`),
        );
      }
    });

    it("cross-organization project-move triggers on all 12 project-derived tables", () => {
      const sql = readMigration();
      const guarded = [
        "sprints",
        "requirements",
        "tasks",
        "backlog",
        "budget_line_items",
        "contracts",
        "approvals",
        "risks",
        "change_requests",
        "milestones",
        "folders",
        "documents",
      ];
      for (const table of guarded) {
        expect(
          sql.includes(`trg_${table}_forbid_cross_org_move`),
          `missing cross-org move trigger on ${table}`,
        ).toBe(true);
      }
    });

    it("organization_members key immutability + last-ADMIN protection present", () => {
      const sql = readMigration();
      expect(sql).toMatch(/last ADMIN/i);
      expect(sql).toMatch(/cannot remove the last ADMIN/);
      expect(sql).toMatch(/cannot demote the last ADMIN/);
      expect(sql).toMatch(/key \(organization_id, user_id\) is immutable/);
    });

    it("users.id immutability trigger present (anti-impersonation)", () => {
      const sql = readMigration();
      expect(sql).toMatch(/users\.id is immutable/);
    });
  });

  describe("RLS-05: developer task boundary encoded (TASK-DEV-01..09 contract)", () => {
    it("tasks_update_dev_self requires assignee=self in USING and WITH CHECK", () => {
      const sql = readMigration();
      const policy = sql.match(
        /CREATE POLICY tasks_update_dev_self ON public\.tasks[\s\S]*?;/,
      )?.[0];
      expect(policy, "tasks_update_dev_self policy missing").toBeDefined();
      expect(policy).toMatch(/USING \([\s\S]*assignee_id = auth\.uid\(\)/);
      expect(policy).toMatch(/WITH CHECK \([\s\S]*assignee_id = auth\.uid\(\)/);
    });

    it("developer update preserves same-project sprint/requirement linkage", () => {
      const sql = readMigration();
      const policy = sql.match(
        /CREATE POLICY tasks_update_dev_self ON public\.tasks[\s\S]*?;/,
      )?.[0];
      expect(policy).toMatch(/smartsprint_sprint_project\(sprint_id\) = project_id/);
      expect(policy).toMatch(/smartsprint_requirement_project\(requirement_id\) = project_id/);
    });

    it("no DEVELOPER INSERT policy on tasks (work assigned by ADMIN/PM only)", () => {
      const sql = readMigration();
      const taskInserts = [...sql.matchAll(/CREATE POLICY (tasks_insert_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(taskInserts).toEqual(["tasks_insert_staff"]);
    });

    it("task DELETE is ADMIN-only (developers cannot delete own or peer tasks)", () => {
      const sql = readMigration();
      const taskDeletes = [...sql.matchAll(/CREATE POLICY (tasks_delete_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(taskDeletes).toEqual(["tasks_delete_admin"]);
    });
  });

  describe("RLS-06: cross-organization FK protections (ISO-15 / ISO-18 contract)", () => {
    it("assignee/owner/manager/lead writes require target membership in the owning org", () => {
      const sql = readMigration();
      const gated = [
        "teams_admin_insert", // lead_id
        "projects_insert_staff", // manager_id
        "requirements_insert_staff", // assignee_id
        "tasks_insert_staff", // assignee_id
        "risks_insert_member", // owner_id
      ];
      for (const policy of gated) {
        const block = sql.match(new RegExp(`CREATE POLICY ${policy}[\\s\\S]*?;`))?.[0];
        expect(block, `${policy} missing`).toBeDefined();
        expect(block).toMatch(/smartsprint_user_is_org_member/);
      }
    });

    it("same-project FK guards on tasks/requirements/backlog/documents/folders/ai_predictions", () => {
      const sql = readMigration();
      expect(sql).toMatch(/smartsprint_sprint_project\(sprint_id\) = project_id/);
      expect(sql).toMatch(/smartsprint_requirement_project\(requirement_id\) = project_id/);
      expect(sql).toMatch(/smartsprint_folder_project\(folder_id\) = project_id/);
      expect(sql).toMatch(/smartsprint_folder_project\(parent_id\) = project_id/);
      expect(sql).toMatch(
        /smartsprint_sprint_project\(suggested_sprint_id\)[\s\S]{0,120}smartsprint_requirement_project\(requirement_id\)/,
      );
    });
  });

  describe("RLS-07: notification privacy + preferences scope + activity-log protection", () => {
    it("notifications: own-only select/update/delete, NO client INSERT (NOTIF-01/02)", () => {
      const sql = readMigration();
      const notifPolicies = [...sql.matchAll(/CREATE POLICY (notifications_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(notifPolicies.sort()).toEqual(
        ["notifications_delete_own", "notifications_select_own", "notifications_update_own"].sort(),
      );
      for (const name of notifPolicies) {
        const block = sql.match(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?;`))?.[0];
        expect(block).toMatch(/user_id = auth\.uid\(\)/);
      }
    });

    it("user_preferences strictly user-scoped on all four operations (PREF-01)", () => {
      const sql = readMigration();
      const prefPolicies = [...sql.matchAll(/CREATE POLICY (user_preferences_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(prefPolicies.sort()).toEqual(
        [
          "user_preferences_delete_own",
          "user_preferences_insert_own",
          "user_preferences_select_own",
          "user_preferences_update_own",
        ].sort(),
      );
      for (const name of prefPolicies) {
        const block = sql.match(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?;`))?.[0];
        expect(block).toMatch(/user_id = auth\.uid\(\)/);
      }
    });

    it("activity_logs: exactly one SELECT policy, zero client write policies (LOG-02)", () => {
      const sql = readMigration();
      const logPolicies = [...sql.matchAll(/CREATE POLICY (activity_logs_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(logPolicies).toEqual(["activity_logs_select_member"]);
    });
  });

  describe("RLS-08: governance + invitations write gates encoded", () => {
    it("budgets are ADMIN-only for writes (GOV-BUD-02)", () => {
      const sql = readMigration();
      // Actual migration names use the {table}_admin_{op} order on this table.
      const budgetWrites = [...sql.matchAll(/CREATE POLICY (budget_line_items_\w+) ON/g)]
        .map((m) => m[1])
        .filter((n) => /insert|update|delete/.test(n));
      expect(budgetWrites.sort()).toEqual(
        [
          "budget_line_items_admin_delete",
          "budget_line_items_admin_insert",
          "budget_line_items_admin_update",
        ].sort(),
      );
    });

    it("approvals force requester=self, pending start, no pre-decision (GOV-APR-01/02)", () => {
      const sql = readMigration();
      const insertMember = sql.match(
        /CREATE POLICY approvals_insert_member[\s\S]*?;/,
      )?.[0];
      expect(insertMember).toMatch(/requester_id = auth\.uid\(\)/);
      expect(insertMember).toMatch(/status = 'pending'/);
      expect(insertMember).toMatch(/decided_by IS NULL/);
      const updateStaff = sql.match(/CREATE POLICY approvals_update_staff[\s\S]*?;/)?.[0];
      expect(updateStaff).toMatch(/decided_by IS NULL OR decided_by = auth\.uid\(\)/);
      expect(updateStaff).toMatch(/requester_id IS DISTINCT FROM decided_by/);
    });

    it("invitations: staff read, ADMIN-only write (RBAC-INV-01 v1: PM-send denied)", () => {
      const sql = readMigration();
      const invPolicies = [...sql.matchAll(/CREATE POLICY (invitations_\w+) ON/g)].map(
        (m) => m[1],
      );
      expect(invPolicies.sort()).toEqual(
        [
          "invitations_admin_delete",
          "invitations_admin_insert",
          "invitations_admin_update",
          "invitations_select_staff",
        ].sort(),
      );
    });

    it("organization_members writes are ADMIN-only (ISO-20 / RBAC-ROLE-01)", () => {
      const sql = readMigration();
      // Actual migration names use the {table}_admin_{op} order on this table.
      const memberWrites = [...sql.matchAll(/CREATE POLICY (organization_members_\w+) ON/g)]
        .map((m) => m[1])
        .filter((n) => /insert|update|delete/.test(n));
      expect(memberWrites.sort()).toEqual(
        [
          "organization_members_admin_delete",
          "organization_members_admin_insert",
          "organization_members_admin_update",
        ].sort(),
      );
    });
  });

  describe("RLS-09: seed fixtures pin required security actors (deterministic)", () => {
    it("three tenant fixtures exist", () => {
      const orgs = loadSeedTable<{ id: string }>("organizations.json");
      const ids = new Set(orgs.map((o) => o.id));
      expect(ids.has("382db5f8-3744-4915-8dca-59e55fce3229")).toBe(true);
      expect(ids.has("23b6b6c9-c0c0-42d7-9b32-a2e93292696a")).toBe(true);
      expect(ids.has("716560fb-6bd4-4481-b5b7-07d68a9ad7c1")).toBe(true);
    });

    it("pinned users resolve to the documented per-org roles", () => {
      expect(seedMembershipRole("462fd273-1ab0-4595-b54d-88a0532a69e6", "382db5f8-3744-4915-8dca-59e55fce3229")).toBe("ADMIN");
      // Same human, different authority per org — role is org-scoped, never global.
      expect(seedMembershipRole("462fd273-1ab0-4595-b54d-88a0532a69e6", "23b6b6c9-c0c0-42d7-9b32-a2e93292696a")).toBe("DEVELOPER");
      expect(seedMembershipRole("a1244bef-a8ab-4f35-b87e-02c136833113", "382db5f8-3744-4915-8dca-59e55fce3229")).toBe("PROJECT_MANAGER");
      expect(seedMembershipRole("06d03d9d-6447-4f26-9e1b-0e02d83095b2", "23b6b6c9-c0c0-42d7-9b32-a2e93292696a")).toBe("ADMIN");
      expect(seedMembershipRole("21f08f45-030c-46c1-90d6-07a1c2d387f7", "382db5f8-3744-4915-8dca-59e55fce3229")).toBe("DEVELOPER");
      expect(seedMembershipRole("21f08f45-030c-46c1-90d6-07a1c2d387f7", "23b6b6c9-c0c0-42d7-9b32-a2e93292696a")).toBe("DEVELOPER");
      expect(seedMembershipRole("21f08f45-030c-46c1-90d6-07a1c2d387f7", "716560fb-6bd4-4481-b5b7-07d68a9ad7c1")).toBe("DEVELOPER");
      expect(seedMembershipRole("eb17277f-a94c-4ac5-a9af-69d3a84cff32", "382db5f8-3744-4915-8dca-59e55fce3229")).toBe("DEVELOPER");
      expect(seedMembershipRole("e06e6d64-62ff-415f-9e0a-675ab3a823db", "382db5f8-3744-4915-8dca-59e55fce3229")).toBe("DEVELOPER");
    });

    it("projects exist in different organizations for isolation tests", () => {
      const projects = loadSeedTable<{ id: string; organization_id: string }>("projects.json");
      expect(projects.some((p) => p.organization_id === "382db5f8-3744-4915-8dca-59e55fce3229")).toBe(true);
      expect(projects.some((p) => p.organization_id === "23b6b6c9-c0c0-42d7-9b32-a2e93292696a")).toBe(true);
    });

    it("assigned developer task, peer task, and unassigned task fixtures exist", () => {
      const tasks = loadSeedTable<{ id: string; project_id: string; assignee_id: string | null }>(
        "tasks.json",
      );
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const own = byId.get("7c32bf78-8bca-47f2-8510-20833bec9421");
      expect(own?.assignee_id).toBe("eb17277f-a94c-4ac5-a9af-69d3a84cff32");
      const peer = byId.get("9875ae4b-ef28-4cfc-944b-d6380457ad14");
      expect(peer?.project_id).toBe(own?.project_id);
      expect(peer?.assignee_id).not.toBe(own?.assignee_id);
      const unassigned = byId.get("032daecc-9162-4aaa-a64e-75db2b6d30f9");
      expect(unassigned?.assignee_id).toBeNull();
    });

    it("notifications belong to different users for inbox-isolation tests", () => {
      const notifs = loadSeedTable<{ id: string; user_id: string }>("notifications.json");
      const byId = new Map(notifs.map((n) => [n.id, n]));
      const first = byId.get("ec166157-acbe-453e-9309-5e8a278f470d");
      const second = byId.get("5a5f6b52-b7f9-4990-af22-e48fed138759");
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first?.user_id).not.toBe(second?.user_id);
    });
  });

  describe("RLS-10: service-role separation scan (SRV-01 static)", () => {
    // A `"use client"` *directive* is only meaningful as the first statement
    // of a module. Substring matching would false-positive on doc comments
    // that merely mention the directive (e.g. provision-server.ts warns
    // against client imports), so detect the directive positionally.
    const hasUseClientDirective = (content: string): boolean => {
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const first = stripped
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      return (
        first === "'use client';" ||
        first === '"use client";' ||
        first === "'use client'" ||
        first === '"use client"'
      );
    };

    it("SUPABASE_SERVICE_ROLE_KEY appears only in server-only modules, never client code", () => {
      // Allow-list: trusted-lane modules that must bypass RLS server-side
      // (provisioning, route handlers, Edge Functions). Everything else —
      // especially `"use client"` bundles — must not touch the key.
      const offenders: string[] = [];
      const clientLeaks: string[] = [];
      const walk = (dir: string): void => {
        const full = path.join(process.cwd(), dir);
        if (!fs.existsSync(full)) return;
        for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
          const entryPath = path.join(full, entry.name);
          if (entry.isDirectory()) {
            walk(path.relative(process.cwd(), entryPath));
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(entryPath, "utf8");
            if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) continue;
            const rel = path.relative(process.cwd(), entryPath);
            const serverOnly =
              entry.name.includes("server") ||
              entry.name === "route.ts" ||
              rel.includes("functions");
            if (!serverOnly) offenders.push(rel);
            if (hasUseClientDirective(content)) {
              clientLeaks.push(rel);
            }
          }
        }
      };
      walk("src");
      expect(offenders, `service-role key outside server-only modules: ${offenders.join(", ")}`).toEqual([]);
      expect(clientLeaks, `service-role key in client bundle: ${clientLeaks.join(", ")}`).toEqual([]);
    });

    it('no "use client" module imports a *-server trusted-lane module', () => {
      const leaks: string[] = [];
      const walk = (dir: string): void => {
        const full = path.join(process.cwd(), dir);
        if (!fs.existsSync(full)) return;
        for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
          const entryPath = path.join(full, entry.name);
          if (entry.isDirectory()) {
            walk(path.relative(process.cwd(), entryPath));
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(entryPath, "utf8");
            const isClient = hasUseClientDirective(content);
            if (isClient && /from\s+["'][^"']*-server["']|require\(["'][^"']*-server["']\)/.test(content)) {
              leaks.push(path.relative(process.cwd(), entryPath));
            }
          }
        }
      };
      walk("src");
      expect(leaks, `client code importing server-only lane: ${leaks.join(", ")}`).toEqual([]);
    });

    it("no NEXT_PUBLIC_* variable carries the service-role key; .env is gitignored", () => {
      const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
      expect(example).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
      const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
      expect(gitignore).toMatch(/^\.env(\.local)?$/m);
    });

    it("security tests themselves never use service-role credentials on the user lane", () => {
      const liveClient = fs.readFileSync(
        path.join(process.cwd(), "tests", "utils", "rls-live-client.ts"),
        "utf8",
      );
      expect(liveClient).not.toMatch(/SERVICE_ROLE/);
      expect(liveClient).toMatch(/runAsUser/);
      expect(liveClient).toMatch(/runAsPrivileged/);
    });
  });

  describe("variances vs auth-rls-test-plan + resolved controls (V1/V3 now enforced)", () => {
    it("teams SELECT restricts developers to their own teams while staff retain org visibility", () => {
      const sql = readMigration();
      const block = sql.match(/CREATE POLICY teams_select_org_member[\s\S]*?;/)?.[0];
      expect(block, "teams_select_org_member policy missing").toBeDefined();
      const text = block ?? "";
      // Organization-membership protection: org members/staff gate (fail-closed).
      expect(text).toMatch(/smartsprint_is_org_member\s*\(\s*organization_id\s*\)/);
      expect(text).toMatch(/smartsprint_is_org_staff\s*\(\s*organization_id\s*\)/);
      // Developer/team-membership restriction: developers see only teams they
      // belong to — semantic check, not alias- or formatting-dependent.
      expect(text.toLowerCase()).toMatch(/team_members/);
      expect(text).toMatch(/auth\.uid\(\)/);
      // Must not be unrestricted.
      expect(text).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(text).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    });

    it("V2: deletes are uniformly ADMIN-only (plan grants PM delete in RBAC-TASK-02/RBAC-BACK-01)", () => {
      const sql = readMigration();
      for (const table of ["tasks", "backlog", "sprints", "requirements", "contracts"]) {
        const deletes = [...sql.matchAll(new RegExp(`CREATE POLICY ${table}_delete_(\\w+) ON`, "g"))].map(
          (m) => m[1],
        );
        expect(deletes, `${table} deletes`).toEqual(["admin"]);
      }
    });

    it("change_requests UPDATE enforces no-self-decision (approvals-parity, GOV-CHG-01)", () => {
      const sql = readMigration();
      const block = sql.match(/CREATE POLICY change_requests_update_staff[\s\S]*?;/)?.[0];
      expect(block, "change_requests_update_staff policy missing").toBeDefined();
      const text = block ?? "";
      // Staff-only decision lane preserved.
      expect(text).toMatch(/smartsprint_is_org_staff/);
      // Real invariant: a requester cannot approve or reject their own request.
      // Approvals-parity guard — pending edits allowed, decisions require a
      // different user (NULL-safe).
      expect(text).toMatch(/requester_id IS DISTINCT FROM auth\.uid\(\)/);
      expect(text).toMatch(/status\s*=\s*'pending'/);
      // Must not be unrestricted.
      expect(text).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(text).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    });

    it("V4: activity_logs SELECT includes a user_id=self OR-branch (cross-org own-action rows readable)", () => {
      const sql = readMigration();
      const block = sql.match(/CREATE POLICY activity_logs_select_member[\s\S]*?;/)?.[0];
      expect(block).toMatch(/user_id = auth\.uid\(\)/);
    });

    it("V5: notifications DELETE own is allowed (plan matrix is read-oriented for inboxes)", () => {
      const sql = readMigration();
      expect(sql).toMatch(/CREATE POLICY notifications_delete_own/);
    });

    it("V6: 26 policy names deviate from the header {table}_{op}_{scope} order (cosmetic, reported)", () => {
      // Two systematic families: {table}_admin_{op} writes on
      // organizations/organization_members/teams/team_members/project_members/
      // invitations/budget_line_items (17 policies), and org/dev-infix reads/
      // updates such as projects_select_org_staff and tasks_update_dev_self
      // (9 policies). Names remain unique, table-prefixed, and idempotent —
      // reviewable, just not uniform. Reported so future policies pick one order.
      const sql = readMigration();
      const names = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)].map((m) => m[1]);
      const strict = /^[a-z_]+_(select|insert|update|delete)_(member|staff|admin|self|own)$/;
      const deviants = names.filter((n) => !strict.test(n));
      expect(deviants.length).toBe(26);
      for (const n of deviants) {
        expect(n).toMatch(/admin|org|dev/);
      }
    });
  });

  describe("live RLS verification gate (requires reachable database)", () => {
    it.skipIf(!isLiveEnvConfigured())(
      "pg_tables shows rowsecurity on all 24 tables; pg_policies has 111 SmartSprint policies",
      async (ctx) => {
        const live = await probeLiveDb();
        if (!live) {
          reportLiveSkipped("database unreachable at probe time");
          ctx.skip();
          return;
        }
        const { runAsPrivileged } = await import("../utils/rls-live-client");
        const tables = await runAsPrivileged(async (client) => {
          const res = await client.query(
            "select tablename from pg_tables where schemaname='public' and rowsecurity = true",
          );
          return (res.rows as Array<{ tablename: string }>).map((r) => r.tablename);
        });
        for (const table of EXPECTED_TABLES) {
          expect(tables, `rowsecurity off on ${table}`).toContain(table);
        }
        const livePolicyNames = await runAsPrivileged(async (client) => {
          // Explicit parentheses: AND binds tighter than OR in SQL, so the
          // schema predicate must wrap the whole OR-group. Without the
          // parens a future OR-branch without its own schemaname check would
          // silently count policies from other schemas (fail-open counting).
          // Filter on op tokens (select/insert/update/delete): RLS-03 proves
          // every SmartSprint policy carries exactly one, so this captures
          // exactly the migration's policies — no broad scope-token matching.
          const res = await client.query(
            "SELECT policyname FROM pg_policies " +
              "WHERE schemaname = 'public' " +
              "AND (" +
              "policyname LIKE '%select%' " +
              "OR policyname LIKE '%insert%' " +
              "OR policyname LIKE '%update%' " +
              "OR policyname LIKE '%delete%'" +
              ")",
          );
          return (res.rows as Array<{ policyname: string }>).map((r) => r.policyname);
        });
        // Exact assertion against the migration text (source of truth): the
        // live database must expose precisely the 111 policies the static
        // contract proves exist — no fewer (missing enforcement) and no more
        // (unexpected policies could be backdoors or drift).
        const expectedPolicyNames = new Set(
          [...readMigration().matchAll(/CREATE POLICY (\w+) ON public\.(\w+)/g)].map(
            (m) => m[1],
          ),
        );
        expect(expectedPolicyNames.size).toBe(111);
        expect(livePolicyNames.length).toBe(111);
        expect(new Set(livePolicyNames).size).toBe(111);
        for (const name of expectedPolicyNames) {
          expect(livePolicyNames, `live policy missing: ${name}`).toContain(name);
        }
        for (const name of livePolicyNames) {
          expect(
            expectedPolicyNames.has(name),
            `unexpected live policy (not in migration): ${name}`,
          ).toBe(true);
        }
      },
    );
  });
});
