/**
 * Governance workflow contract tests (STATIC — no database required).
 *
 * Pins the Phase 6 completion fixes:
 * - Migration 0009 adds the additive, nullable `approvals.decided_reason`
 *   column, mirrored in `supabase/schema.ts`.
 * - Approval submission rejects duplicate pending requests.
 * - Approval decisions persist the reviewer rationale and write an
 *   `activity_logs` audit entry (all creates/decides/edits/deletes do).
 * - The governance page renders persisted rows (no mock arrays) and
 *   wires approve/reject with a reason field.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { approvals } from "@supabase/schema";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const GOVERNANCE_POST = readSource(
  "src",
  "app",
  "api",
  "governance",
  "route.ts",
);
const GOVERNANCE_ITEM = readSource(
  "src",
  "app",
  "api",
  "governance",
  "[id]",
  "route.ts",
);
const GOVERNANCE_PAGE = readSource("src", "app", "governance", "page.tsx");

describe("governance decision-reason persistence", () => {
  it("migration 0009 adds an additive nullable decided_reason column", () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, "0009_approval_decision_reason.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS decided_reason text/);
    expect(sql).not.toMatch(/DROP TABLE|ALTER TABLE public\.approvals DROP/);
  });

  it("schema.ts mirrors decided_reason on approvals", () => {
    expect(Object.keys(approvals)).toContain("decidedReason");
  });

  it("the decide route validates, persists, and caps the reason", () => {
    expect(GOVERNANCE_ITEM).toMatch(/parseDecisionReason/);
    expect(GOVERNANCE_ITEM).toMatch(/decided_reason/);
    expect(GOVERNANCE_ITEM).toMatch(/MAX_DECISION_REASON_LENGTH/);
  });
});

describe("governance audit trail and duplicate handling", () => {
  it("every create path writes an activity_logs entry", () => {
    expect(GOVERNANCE_POST).toMatch(/logGovernanceActivity/);
    expect(GOVERNANCE_POST).toMatch(/db\.insert\(activityLogs\)/);
    // All five resources covered.
    const hits = GOVERNANCE_POST.match(/logGovernanceActivity\(/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it("decisions, edits, and deletes write audit entries", () => {
    expect(GOVERNANCE_ITEM).toMatch(/logGovernanceActivity/);
    const hits = GOVERNANCE_ITEM.match(/logGovernanceActivity\(/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it("duplicate pending approvals are rejected before insert", () => {
    expect(GOVERNANCE_POST).toMatch(/pendingDup/);
    expect(GOVERNANCE_POST).toMatch(/Duplicate pending approval/);
  });

  it("already-decided approvals and change requests stay final", () => {
    expect(GOVERNANCE_ITEM).toMatch(/already decided/);
    expect(GOVERNANCE_ITEM).toMatch(/requester_id === user\.id/);
  });
});

describe("governance page real-data wiring", () => {
  it("renders persisted rows instead of mock arrays", () => {
    expect(GOVERNANCE_PAGE).not.toMatch(/const budgetItems = \[/);
    expect(GOVERNANCE_PAGE).not.toMatch(/const approvals = \[/);
    expect(GOVERNANCE_PAGE).not.toMatch(/const changeRequests = \[/);
    expect(GOVERNANCE_PAGE).toMatch(/\/api\/governance\?resource=/);
    expect(GOVERNANCE_PAGE).toMatch(/\/api\/risks\?projectId=/);
  });

  it("wires approve/reject with a reason field and create forms", () => {
    expect(GOVERNANCE_PAGE).toMatch(/handleDecision/);
    expect(GOVERNANCE_PAGE).toMatch(/reason/);
    expect(GOVERNANCE_PAGE).toMatch(/handleCreateContract/);
    expect(GOVERNANCE_PAGE).toMatch(/handleCreateChange/);
  });
});
