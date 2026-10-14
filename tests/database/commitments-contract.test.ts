/**
 * Commitments schema/migration contract tests (STATIC — no database required).
 *
 * Pins the 0007/0008 SQL migration text and its reflection in
 * `supabase/schema.ts` (the Drizzle source of truth):
 * - 0007 creates `public.commitments` with FKs, checks, indexes, RLS, and
 *   exactly the five `commitments_*` policies.
 * - 0008 adds `backlog.commitment_id` with the SET NULL FK and index.
 * - `supabase/schema.ts` exposes the `commitments` table and the
 *   `backlog.commitmentId` column with matching names/behaviors.
 *
 * Importing `@supabase/schema` here also proves the module loads (the
 * `backlog → commitments` table reference resolves at import time).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { backlog, commitments } from "@supabase/schema";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const SCHEMA_PATH = path.join(process.cwd(), "supabase", "schema.ts");

function readSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

describe("commitments migration contract (static)", () => {
  it("0007 creates the commitments table with FKs, checks, and indexes", () => {
    const sql = readSql("0007_commitments.sql");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.commitments/);
    expect(sql).toMatch(/FOREIGN KEY \(project_id\)/);
    expect(sql).toMatch(/REFERENCES public\.projects\(id\)/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
    expect(sql).toMatch(/FOREIGN KEY \(owner_id\)/);
    expect(sql).toMatch(/REFERENCES public\.users\(id\)/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/commitments_progress_check/);
    expect(sql).toMatch(/commitments_type_check/);
    expect(sql).toMatch(/commitments_status_check/);
    expect(sql).toMatch(/idx_commitments_project_id/);
    expect(sql).toMatch(/idx_commitments_owner_id/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it("0007 defines exactly the five commitments_* policies", () => {
    const sql = readSql("0007_commitments.sql");
    const policies = [
      ...sql.matchAll(/CREATE POLICY (\w+)\s+ON public\.commitments/g),
    ].map((m) => m[1]);
    expect([...policies].sort()).toEqual([
      "commitments_delete_admin",
      "commitments_insert_staff",
      "commitments_select_member",
      "commitments_select_staff",
      "commitments_update_staff",
    ]);
    // Delete stays admin-only; reads cover staff and project members.
    expect(sql).toMatch(/FOR DELETE/);
    expect(sql).toMatch(/smartsprint_is_org_admin/);
  });

  it("0008 links backlog to commitments with SET NULL semantics", () => {
    const sql = readSql("0008_backlog_commitments.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS commitment_id uuid/);
    expect(sql).toMatch(/backlog_commitment_id_fkey/);
    expect(sql).toMatch(/REFERENCES public\.commitments\(id\)/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/idx_backlog_commitment_id/);
  });
});

describe("commitments Drizzle schema parity (static)", () => {
  it("schema.ts exposes the commitments table with matching columns", () => {
    const text = fs.readFileSync(SCHEMA_PATH, "utf8");
    expect(text).toMatch(/export const commitments = pgTable\("commitments"/);
    expect(text).toMatch(/commitments_project_id_fkey/);
    expect(text).toMatch(/commitments_owner_id_fkey/);
    expect(text).toMatch(/commitments_progress_check/);
    expect(text).toMatch(/commitments_type_check/);
    expect(text).toMatch(/commitments_status_check/);

    // Runtime proof the table object loaded with the migrated shape.
    const columns = Object.keys(commitments);
    for (const column of [
      "id",
      "projectId",
      "title",
      "description",
      "commitmentType",
      "status",
      "dueDate",
      "progress",
      "ownerId",
      "createdAt",
      "updatedAt",
    ]) {
      expect(columns, `commitments missing column ${column}`).toContain(column);
    }
  });

  it("schema.ts exposes backlog.commitmentId with the 0008 FK behavior", () => {
    const text = fs.readFileSync(SCHEMA_PATH, "utf8");
    expect(text).toMatch(/backlog_commitment_id_fkey/);
    expect(text).toMatch(/idx_backlog_commitment_id/);
    expect(Object.keys(backlog)).toContain("commitmentId");
  });
});
