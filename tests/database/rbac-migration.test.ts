/**
 * RBAC migration static contract — pins the 0004 expansion + 0005 RLS
 * rewrite deliverables (§7.3: RLS blocks unauthorized access even when
 * API authorization is bypassed).
 *
 * DB-free: asserts on migration file contents so CI catches accidental
 * policy removal. Live behavioral tests remain in tests/auth + tests/database
 * (skipped without DATABASE_URL).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

describe("0004_rbac_expansion", () => {
  const sql = readMigration("0004_rbac_expansion.sql");

  it("adds FINANCE, LEGAL, HR roles and defers HR employee tables", () => {
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'FINANCE'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'LEGAL'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'HR'");
    expect(sql).toContain("leave_requests");
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS employees/);
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS leave_requests/);
  });

  it("creates role_change_requests with the pending-per-user guard", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS role_change_requests");
    expect(sql).toContain("uq_role_change_requests_pending_per_user");
    expect(sql).toContain('requested_role <> "current_role"');
  });

  it("creates task_dependencies and task_attachments with storage buckets", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS task_dependencies");
    expect(sql).toContain("task_id <> depends_on_task_id");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS task_attachments");
    expect(sql).toContain("project-documents");
    expect(sql).toContain("task-attachments");
  });

  it("adds risk-domain and AI dedup columns", () => {
    expect(sql).toContain("risk_domain");
    expect(sql).toContain("issue_type");
    expect(sql).toContain("entity_id");
    expect(sql).toContain("uq_ai_insights_dedup");
  });
});

describe("0005_rbac_rls_rewrite", () => {
  const sql = readMigration("0005_rbac_rls_rewrite.sql");

  it("adds typed approval + risk-domain + document helpers", () => {
    expect(sql).toContain("smartsprint_can_submit_approval");
    expect(sql).toContain("smartsprint_can_decide_approval");
    expect(sql).toContain("smartsprint_can_resolve_risk");
    expect(sql).toContain("smartsprint_can_access_documents");
    expect(sql).toContain("smartsprint_can_edit_budget");
    expect(sql).toContain("smartsprint_caller_role");
    expect(sql).toContain("smartsprint_is_hr");
  });

  it("replaces broad approval policy with typed routing", () => {
    expect(sql).toContain("approvals_insert_typed");
    expect(sql).toContain("approvals_update_typed");
    expect(sql).not.toMatch(/CREATE POLICY approvals_update_staff/);
  });

  it("adds FINANCE/LEGAL own-domain risk policies", () => {
    expect(sql).toContain("risks_update_finance");
    expect(sql).toContain("risks_update_legal");
  });

  it("secures role_change_requests with two-shape INSERT + ADMIN UPDATE", () => {
    expect(sql).toContain("role_change_requests_insert");
    expect(sql).toContain("role_change_requests_select");
    expect(sql).toContain("role_change_requests_update");
  });

  it("blocks direct organization_members.role writes via trigger", () => {
    expect(sql).toContain("smartsprint_forbid_direct_role_change");
    expect(sql).toContain("app.bypass_role_guard");
    expect(sql).toContain("role_change_requests workflow");
  });

  it("keeps notifications own-only and restricts audit to ADMIN", () => {
    expect(sql).toContain("activity_logs_select_admin");
    expect(sql).not.toMatch(/CREATE POLICY activity_logs_select_member/);
  });

  it("clears blockedReason atomically and bounds non-staff task edits", () => {
    expect(sql).toContain("smartsprint_tasks_blocked_guard");
    expect(sql).toContain("smartsprint_restrict_dev_task_update");
  });

  it("mirrors metadata authorization into Storage objects", () => {
    expect(sql).toContain("smartsprint_can_read_storage_object");
    expect(sql).toContain("storage_documents_select");
  });

  it("grants HR invitation access and PM membership management", () => {
    expect(sql).toContain("invitations_hr_insert");
    expect(sql).toContain("project_members_pm_insert");
  });
});

describe("0006_hr_member_removal", () => {
  const sql = readMigration("0006_hr_member_removal.sql");

  it("lets HR remove members without self-removal", () => {
    expect(sql).toContain("organization_members_hr_delete");
    expect(sql).toContain("user_id <> auth.uid()");
  });
});

describe("drizzle schema parity", () => {
  const schema = readFileSync(
    join(process.cwd(), "supabase", "schema.ts"),
    "utf8",
  );

  it("declares the six-role enum and new tables", () => {
    expect(schema).toContain("'FINANCE'");
    expect(schema).toContain("'LEGAL'");
    expect(schema).toContain("roleChangeRequests");
    expect(schema).toContain("taskDependencies");
    expect(schema).toContain("taskAttachments");
    expect(schema).toContain("riskDomain");
  });
});
