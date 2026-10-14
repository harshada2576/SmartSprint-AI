/**
 * Commitment mutation validation contract tests (DB-free).
 *
 * Covers `src/schemas/commitment-mutations.ts` (create/update/query
 * parsers) plus a static route-contract scan proving both commitment
 * routes validate before writing, probe project accessibility, and map
 * RLS denials (42501) to 403 instead of 500.
 *
 * No database required. Live RLS behavior for the `commitments_*`
 * policies remains covered by `tests/auth/*` + `tests/database/*`
 * (`npm run test:security`).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMITMENT_STATUSES,
  COMMITMENT_TYPES,
  parseCommitmentCreateBody,
  parseCommitmentUpdateBody,
  validateCommitmentsQuery,
} from "../../src/schemas/commitment-mutations";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

function readRoute(...segments: string[]): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "commitments", ...segments),
    "utf8",
  );
}

describe("commitment create body validation", () => {
  it("accepts a minimal valid payload", () => {
    const parsed = parseCommitmentCreateBody({
      project_id: PROJECT_ID,
      title: "Ship onboarding flow",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.project_id).toBe(PROJECT_ID);
      expect(parsed.value.title).toBe("Ship onboarding flow");
    }
  });

  it("accepts a full valid payload with camelCase aliases", () => {
    const parsed = parseCommitmentCreateBody({
      projectId: PROJECT_ID,
      title: "Outcome",
      description: "Details",
      commitmentType: "milestone",
      status: "inProgress",
      dueDate: "2026-03-01",
      progress: 50,
      ownerId: OWNER_ID,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.commitment_type).toBe("milestone");
      expect(parsed.value.status).toBe("inProgress");
      expect(parsed.value.due_date).toBe("2026-03-01");
      expect(parsed.value.progress).toBe(50);
      expect(parsed.value.owner_id).toBe(OWNER_ID);
    }
  });

  it("rejects missing project_id and title", () => {
    const parsed = parseCommitmentCreateBody({});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const fields = parsed.details.map((d) => d.field);
      expect(fields).toContain("project_id");
      expect(fields).toContain("title");
    }
  });

  it("rejects malformed project_id UUID", () => {
    const parsed = parseCommitmentCreateBody({
      project_id: "not-a-uuid",
      title: "T",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.details[0].field).toBe("project_id");
    }
  });

  it("rejects unknown commitment_type and status instead of 500ing at the DB CHECK", () => {
    const parsed = parseCommitmentCreateBody({
      project_id: PROJECT_ID,
      title: "T",
      commitment_type: "wish",
      status: "dreaming",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const fields = parsed.details.map((d) => d.field);
      expect(fields).toContain("commitment_type");
      expect(fields).toContain("status");
    }
  });

  it("rejects out-of-range and non-integer progress", () => {
    for (const progress of [-1, 101, 12.5, "fifty"]) {
      const parsed = parseCommitmentCreateBody({
        project_id: PROJECT_ID,
        title: "T",
        progress,
      });
      expect(parsed.ok, `progress=${String(progress)}`).toBe(false);
    }
    expect(
      parseCommitmentCreateBody({
        project_id: PROJECT_ID,
        title: "T",
        progress: 100,
      }).ok,
    ).toBe(true);
  });

  it("rejects malformed due_date values", () => {
    for (const due_date of ["03/01/2026", "2026-13-01", "tomorrow", 20260301]) {
      const parsed = parseCommitmentCreateBody({
        project_id: PROJECT_ID,
        title: "T",
        due_date,
      });
      expect(parsed.ok, `due_date=${String(due_date)}`).toBe(false);
    }
  });

  it("rejects malformed owner_id UUID", () => {
    const parsed = parseCommitmentCreateBody({
      project_id: PROJECT_ID,
      title: "T",
      owner_id: "owner-1",
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(parseCommitmentCreateBody(null).ok).toBe(false);
    expect(parseCommitmentCreateBody("title").ok).toBe(false);
    expect(parseCommitmentCreateBody([]).ok).toBe(false);
  });
});

describe("commitment update body validation", () => {
  it("accepts partial updates and explicit null clears", () => {
    const parsed = parseCommitmentUpdateBody({
      status: "completed",
      progress: 100,
      description: null,
      owner_id: null,
      due_date: null,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.status).toBe("completed");
      expect(parsed.value.description).toBeNull();
      expect(parsed.value.owner_id).toBeNull();
      expect(parsed.value.due_date).toBeNull();
      expect(parsed.value.projectIdAttempt).toBeUndefined();
    }
  });

  it("records project-move attempts for the route to reject", () => {
    const parsed = parseCommitmentUpdateBody({ project_id: PROJECT_ID });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.projectIdAttempt).toBe(PROJECT_ID);
    }
  });

  it("rejects empty titles, bad enums, and bad progress", () => {
    const parsed = parseCommitmentUpdateBody({
      title: "   ",
      commitment_type: "wish",
      status: "dreaming",
      progress: 101,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const fields = parsed.details.map((d) => d.field);
      expect(fields).toContain("title");
      expect(fields).toContain("commitment_type");
      expect(fields).toContain("status");
      expect(fields).toContain("progress");
    }
  });
});

describe("commitments query validation", () => {
  it("requires projectId", () => {
    const result = validateCommitmentsQuery(new URLSearchParams());
    expect("response" in result).toBe(true);
  });

  it("rejects malformed projectId", () => {
    const result = validateCommitmentsQuery(
      new URLSearchParams({ projectId: "nope" }),
    );
    expect("response" in result).toBe(true);
  });

  it("accepts a valid projectId", () => {
    const result = validateCommitmentsQuery(
      new URLSearchParams({ projectId: PROJECT_ID }),
    );
    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.projectId).toBe(PROJECT_ID);
    }
  });
});

describe("commitment route contract (static scan)", () => {
  it("collection route validates, probes project access, and maps RLS denials", () => {
    const src = readRoute("route.ts");
    expect(src).toMatch(/validateCommitmentsQuery/);
    expect(src).toMatch(/parseCommitmentCreateBody/);
    expect(src).toMatch(/isProjectAccessible/);
    expect(src).toMatch(/forbiddenResponse/);
    expect(src).toMatch(/validationErrorResponse/);
    expect(src).toMatch(/code === "42501"/);
    // Never trusts client-supplied org/user identity.
    expect(src).not.toMatch(/organization_id.*request|searchParams\.get\("org/);
  });

  it("item route serves GET with 404s, validates PUT, and guards DELETE", () => {
    const src = readRoute("[id]", "route.ts");
    expect(src).toMatch(/export async function GET/);
    expect(src).toMatch(/export async function PUT/);
    expect(src).toMatch(/export async function DELETE/);
    expect(src).toMatch(/parseCommitmentUpdateBody/);
    expect(src).toMatch(/notFoundResponse/);
    expect(src).toMatch(/projectIdAttempt/);
    expect(src).toMatch(/isUuid\(id\)/);
    expect(src).toMatch(/code === "42501"/);
  });

  it("documents the enum contract shared with migration 0007", () => {
    expect([...COMMITMENT_TYPES].sort().join(",")).toBe(
      "deliverable,milestone,obligation,outcome",
    );
    expect([...COMMITMENT_STATUSES].sort().join(",")).toBe(
      "blocked,completed,inProgress,planned",
    );
  });
});
