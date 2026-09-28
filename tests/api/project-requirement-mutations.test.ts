/**
 * Project/requirement mutation API contract tests (DB-free).
 *
 * Ownership: Backend/API agent — API contract tests (permitted by AGENTS.md:
 * "tests unless strictly required for API contract tests").
 *
 * Two layers, neither requiring a database:
 * 1. Pure validation + response-envelope tests (schemas, canonical helpers).
 * 2. Service authorization tests with mocked repositories (role gates, org
 *    derivation, cross-org denial, duplicate handling, developer boundary).
 *
 * Live RLS behavior remains covered by `tests/auth/*` + `tests/database/*`
 * (`npm run test:security`). Route-level HTTP tests are intentionally absent:
 * routes depend on the Next.js server runtime (`next/headers` cookies), so
 * unauthenticated/HTTP cases are pinned by the static route-contract scans
 * below plus the response-envelope unit tests.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestScope } from "../../src/types/api";
import {
  parseProjectCreateBody,
  parseProjectUpdateBody,
} from "../../src/schemas/project-mutations";
import {
  parseRequirementCreateBody,
  parseRequirementUpdateBody,
} from "../../src/schemas/requirement-mutations";
import {
  createdResponse,
  mutationFailureResponse,
  successResponse,
  unauthenticatedResponse,
  validationErrorResponse,
} from "../../src/api/response";
import { DbWriteError } from "../../src/repositories/mutation-helpers";

// ---------------------------------------------------------------------------
// Repository mocks (services under test never touch a database)
// ---------------------------------------------------------------------------

vi.mock("../../src/repositories/project.repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/repositories/project.repository")>();
  return {
    ...actual,
    findAccessibleProjectById: vi.fn(),
    findProjectRowById: vi.fn(),
    isProjectCodeTaken: vi.fn(),
    generateProjectCode: vi.fn(),
    insertProject: vi.fn(),
    updateProjectById: vi.fn(),
  };
});

vi.mock(
  "../../src/repositories/requirement.repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<typeof import("../../src/repositories/requirement.repository")>();
    return {
      ...actual,
      findRequirementRowById: vi.fn(),
      findLinkedRequirementById: vi.fn(),
      countRequirementsInProject: vi.fn(),
      generateRequirementDisplayId: vi.fn(),
      insertRequirement: vi.fn(),
      updateRequirementById: vi.fn(),
    };
  },
);

vi.mock("../../src/repositories/sprint.repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/repositories/sprint.repository")>();
  return { ...actual, findAccessibleSprintById: vi.fn() };
});

vi.mock("../../src/repositories/mutation-helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/repositories/mutation-helpers")>();
  return { ...actual, isUserOrgMember: vi.fn() };
});

import {
  findAccessibleProjectById,
  findProjectRowById,
  generateProjectCode,
  insertProject,
  isProjectCodeTaken,
  updateProjectById,
  type ProjectRow,
} from "../../src/repositories/project.repository";
import {
  countRequirementsInProject,
  findLinkedRequirementById,
  findRequirementRowById,
  generateRequirementDisplayId,
  insertRequirement,
  updateRequirementById,
  type RequirementRow,
} from "../../src/repositories/requirement.repository";
import { findAccessibleSprintById } from "../../src/repositories/sprint.repository";
import { isUserOrgMember } from "../../src/repositories/mutation-helpers";
import {
  createProject,
  updateProject,
} from "../../src/services/project.service";
import {
  createRequirement,
  updateRequirement,
} from "../../src/services/requirement.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "382db5f8-3744-4915-8dca-59e55fce3229";
const ORG_B = "23b6b6c9-c0c0-42d7-9b32-a2e93292696a";
const PROJECT_A = "2a47513a-1d92-4e85-8f1d-23b55a1cf476";
const PROJECT_B = "6d07eed1-130c-497e-8db9-04f2f49f0ef1";
const SPRINT_A = "c9c5e39c-148b-4be9-8b18-45acc690d9b4";
const SPRINT_B = "b7f09ef6-de5f-49eb-ac6b-70bc8de66f21";
const REQ_A = "43951991-a533-4255-85b0-e354c59a317e";
const DEV_A1 = "eb17277f-a94c-4ac5-a9af-69d3a84cff32";
const DEV_A2 = "e06e6d64-62ff-415f-9e0a-675ab3a823db";
const MANAGER_A = "a1244bef-a8ab-4f35-b87e-02c136833113";

const client = {} as unknown as SupabaseClient;

function scopeFor(
  userId: string,
  memberships: Array<{ org: string; role: RequestScope["rolesByOrg"][string] }>,
): RequestScope {
  const rolesByOrg: RequestScope["rolesByOrg"] = {};
  for (const { org, role } of memberships) rolesByOrg[org] = role;
  return {
    userId,
    organizationIds: memberships.map((m) => m.org),
    rolesByOrg,
    isStaffAnywhere: memberships.some(
      (m) => m.role === "ADMIN" || m.role === "PROJECT_MANAGER",
    ),
  };
}

const ADMIN_SCOPE = scopeFor("admin-a", [{ org: ORG_A, role: "ADMIN" }]);
const PM_SCOPE = scopeFor("pm-a", [{ org: ORG_A, role: "PROJECT_MANAGER" }]);
const DEV_SCOPE = scopeFor(DEV_A1, [{ org: ORG_A, role: "DEVELOPER" }]);
const OUTSIDER_SCOPE = scopeFor("outsider", []);

function projectRow(overrides?: Partial<ProjectRow>): ProjectRow {
  return {
    id: PROJECT_A,
    organization_id: ORG_A,
    name: "Aurora Customer Portal",
    code: "AUR",
    description: null,
    client: null,
    manager_id: null,
    method: "scrum",
    status: "active",
    priority: "high",
    progress: 0,
    start_date: null,
    end_date: null,
    budget_total: null,
    budget_currency: "USD",
    created_at: "2025-06-19T05:22:34.000Z",
    updated_at: "2025-06-19T05:22:34.000Z",
    ...overrides,
  };
}

function requirementRow(overrides?: Partial<RequirementRow>): RequirementRow {
  return {
    id: REQ_A,
    display_id: "AUR-001",
    project_id: PROJECT_A,
    title: "Example requirement",
    description: null,
    category: "feature",
    business_value: "medium",
    customer_importance: null,
    urgency: null,
    complexity: null,
    estimated_effort: null,
    risk: null,
    story_points: null,
    dependency_id: null,
    priority: "medium",
    status: "draft",
    assignee_id: DEV_A1,
    sprint_id: null,
    created_at: "2025-06-25T09:00:00.000Z",
    updated_at: "2025-06-25T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Project body validation
// ---------------------------------------------------------------------------

describe("parseProjectCreateBody", () => {
  it("accepts a minimal valid body", () => {
    const parsed = parseProjectCreateBody({ name: "New Project" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.name).toBe("New Project");
  });

  it("rejects non-object and empty bodies (malformed body → 400 shape)", () => {
    for (const body of [null, undefined, "name", 42, [], ""]) {
      const parsed = parseProjectCreateBody(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.details[0]?.field).toBe("body");
    }
    const missing = parseProjectCreateBody({});
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.details.some((d) => d.field === "name")).toBe(true);
    }
  });

  it("uppercases codes and rejects malformed codes", () => {
    const ok = parseProjectCreateBody({ name: "N", code: "ecom-2025" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.code).toBe("ECOM-2025");
    for (const code of ["x", "has space", "semi;colon", "a".repeat(21)]) {
      const parsed = parseProjectCreateBody({ name: "N", code });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.details.some((d) => d.field === "code")).toBe(true);
      }
    }
  });

  it("rejects enums outside the schema (UI-only 'critical' priority → 400)", () => {
    const parsed = parseProjectCreateBody({ name: "N", priority: "critical" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.details.some((d) => d.field === "priority")).toBe(true);
    }
    for (const [field, value] of [
      ["method", "prince2"],
      ["status", "archived"],
    ] as const) {
      const bad = parseProjectCreateBody({ name: "N", [field]: value });
      expect(bad.ok).toBe(false);
    }
  });

  it("rejects bad dates, inverted ranges, and bad budgets", () => {
    expect(
      parseProjectCreateBody({ name: "N", startDate: "15-01-2025" }).ok,
    ).toBe(false);
    expect(
      parseProjectCreateBody({
        name: "N",
        startDate: "2025-09-01",
        endDate: "2025-01-01",
      }).ok,
    ).toBe(false);
    expect(parseProjectCreateBody({ name: "N", budgetTotal: -5 }).ok).toBe(
      false,
    );
    // Budgets normalize to 2 decimals (numeric(12,2) storage).
    const rounded = parseProjectCreateBody({ name: "N", budgetTotal: 10.999 });
    expect(rounded.ok).toBe(true);
    if (rounded.ok) expect(rounded.value.budgetTotal).toBe("11.00");
    expect(parseProjectCreateBody({ name: "N", budgetTotal: "lots" }).ok).toBe(
      false,
    );
    expect(
      parseProjectCreateBody({ name: "N", managerId: "not-a-uuid" }).ok,
    ).toBe(false);
  });

  it("accepts snake_case aliases and ignores authority fields", () => {
    const parsed = parseProjectCreateBody({
      name: "N",
      manager_id: MANAGER_A,
      start_date: "2025-01-15",
      budget_total: 1000,
      budget_currency: "eur",
      userId: "forged",
      role: "ADMIN",
      id: "forged",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.managerId).toBe(MANAGER_A);
      expect(parsed.value.startDate).toBe("2025-01-15");
      expect(parsed.value.budgetCurrency).toBe("EUR");
      expect("userId" in parsed.value).toBe(false);
      expect("role" in parsed.value).toBe(false);
    }
  });

  it("treats organizationId as a selector hint, rejecting malformed UUIDs", () => {
    const bad = parseProjectCreateBody({ name: "N", organizationId: "org-a" });
    expect(bad.ok).toBe(false);
    const ok = parseProjectCreateBody({ name: "N", organization_id: ORG_A });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.organizationIdHint).toBe(ORG_A);
  });
});

describe("parseProjectUpdateBody", () => {
  it("requires at least one editable field", () => {
    const parsed = parseProjectUpdateBody({});
    expect(parsed.ok).toBe(false);
  });

  it("rejects organization transfer attempts", () => {
    const parsed = parseProjectUpdateBody({ organizationId: ORG_B });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.organizationIdAttempt).toBe(ORG_B);
  });

  it("accepts partial updates and validates values", () => {
    const ok = parseProjectUpdateBody({ status: "completed", progress: 50 });
    expect(ok.ok).toBe(true);
    expect(parseProjectUpdateBody({ progress: 101 }).ok).toBe(false);
    expect(parseProjectUpdateBody({ code: "" }).ok).toBe(false);
    expect(parseProjectUpdateBody({ name: "  " }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement body validation
// ---------------------------------------------------------------------------

describe("parseRequirementCreateBody", () => {
  it("accepts a minimal valid body", () => {
    const parsed = parseRequirementCreateBody({
      projectId: PROJECT_A,
      title: "Login flow",
      category: "feature",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects missing/invalid identifiers and enums (malformed → 400 shape)", () => {
    expect(parseRequirementCreateBody({}).ok).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: "nope",
        title: "T",
        category: "feature",
      }).ok,
    ).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: PROJECT_A,
        title: "T",
        category: "epic",
      }).ok,
    ).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: PROJECT_A,
        title: "T",
        category: "feature",
        status: "approved",
      }).ok,
    ).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: PROJECT_A,
        title: "T",
        category: "feature",
        urgency: "soon",
      }).ok,
    ).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: PROJECT_A,
        title: "T",
        category: "feature",
        storyPoints: 1.5,
      }).ok,
    ).toBe(false);
    expect(
      parseRequirementCreateBody({
        projectId: PROJECT_A,
        title: "T",
        category: "feature",
        risk: 101,
      }).ok,
    ).toBe(false);
  });

  it("accepts the full UI field set with aliases, ignoring display/authority fields", () => {
    const parsed = parseRequirementCreateBody({
      project_id: PROJECT_A,
      title: "Login flow",
      description: "As a user…",
      category: "security",
      business_value: "high",
      customer_importance: 80,
      urgency: 10,
      complexity: 3,
      estimated_effort: 21,
      risk: 5,
      story_points: 8,
      priority: "high",
      status: "pending",
      assignee_id: DEV_A1,
      sprint_id: SPRINT_A,
      displayId: "FORGED-999",
      organizationId: ORG_B,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.businessValue).toBe("high");
      expect(parsed.value.storyPoints).toBe(8);
      expect("displayId" in parsed.value).toBe(false);
      expect("organizationId" in parsed.value).toBe(false);
    }
  });
});

describe("parseRequirementUpdateBody", () => {
  it("requires at least one editable field", () => {
    expect(parseRequirementUpdateBody({}).ok).toBe(false);
    expect(parseRequirementUpdateBody(null).ok).toBe(false);
  });

  it("captures project moves and display rewrites for rejection", () => {
    const parsed = parseRequirementUpdateBody({
      projectId: PROJECT_B,
      displayId: "X-1",
      status: "review",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.projectIdAttempt).toBe(PROJECT_B);
      expect(parsed.value.displayIdAttempt).toBe(true);
    }
    expect(
      parseRequirementUpdateBody({ projectId: "not-a-uuid" }).ok,
    ).toBe(false);
  });

  it("validates editable values", () => {
    expect(parseRequirementUpdateBody({ status: "inProgress" }).ok).toBe(true);
    expect(parseRequirementUpdateBody({ status: "shipped" }).ok).toBe(false);
    expect(parseRequirementUpdateBody({ title: "" }).ok).toBe(false);
    expect(parseRequirementUpdateBody({ assigneeId: "x" }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Canonical response contract
// ---------------------------------------------------------------------------

describe("mutation response contract", () => {
  it("401 UNAUTHENTICATED envelope", async () => {
    const res = unauthenticatedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
  });

  it("201 created envelope (POST success)", async () => {
    const res = createdResponse({ id: "new-id" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: { id: "new-id" },
    });
  });

  it("200 success envelope (PATCH success)", async () => {
    const res = successResponse({ id: "id" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: "id" } });
  });

  it("mutation failures map codes to statuses without leaking details", async () => {
    const forbidden = mutationFailureResponse({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });

    const missing = mutationFailureResponse({
      code: "NOT_FOUND",
      message: "Project not found",
    });
    expect(missing.status).toBe(404);

    const invalid = mutationFailureResponse({
      code: "VALIDATION_ERROR",
      message: "Project code is already in use in this organization",
      details: [{ field: "code", message: "code must be unique" }],
    });
    expect(invalid.status).toBe(400);
    const body = (await invalid.json()) as {
      error: { details: unknown[] };
    };
    expect(body.error.details).toHaveLength(1);
  });

  it("malformed JSON bodies answer 400, never SQL", async () => {
    const res = validationErrorResponse([
      { field: "body", message: "Request body must be valid JSON" },
    ]);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text.toLowerCase()).not.toMatch(/sql|postgres|pg_|relation|column/);
  });
});

// ---------------------------------------------------------------------------
// Project service authorization
// ---------------------------------------------------------------------------

describe("createProject authorization", () => {
  it("ADMIN creates in their derived organization (201 path)", async () => {
    vi.mocked(isProjectCodeTaken).mockResolvedValue(false);
    vi.mocked(insertProject).mockResolvedValue(projectRow());
    const result = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      code: "AUR2",
    });
    expect(result.ok).toBe(true);
    expect(vi.mocked(insertProject).mock.calls[0]?.[1]).toMatchObject({
      organization_id: ORG_A,
      name: "Aurora",
      code: "AUR2",
    });
  });

  it("PROJECT_MANAGER may create; generated codes are used when absent", async () => {
    vi.mocked(generateProjectCode).mockResolvedValue("AURX");
    vi.mocked(insertProject).mockResolvedValue(projectRow({ code: "AURX" }));
    const result = await createProject(client, PM_SCOPE, { name: "Aurora" });
    expect(result.ok).toBe(true);
    expect(vi.mocked(generateProjectCode)).toHaveBeenCalledWith(
      client,
      ORG_A,
      "Aurora",
    );
  });

  it("DEVELOPER and outsiders are denied without touching the database", async () => {
    for (const scope of [DEV_SCOPE, OUTSIDER_SCOPE]) {
      const result = await createProject(client, scope, { name: "Aurora" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe("FORBIDDEN");
    }
    expect(vi.mocked(insertProject)).not.toHaveBeenCalled();
  });

  it("cross-org attempts via organizationId hint are denied (never trusted)", async () => {
    const result = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      organizationIdHint: ORG_B,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("FORBIDDEN");
    expect(vi.mocked(insertProject)).not.toHaveBeenCalled();
  });

  it("duplicate project codes answer VALIDATION_ERROR (pre-check + race)", async () => {
    vi.mocked(isProjectCodeTaken).mockResolvedValue(true);
    const pre = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      code: "AUR",
    });
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.failure.code).toBe("VALIDATION_ERROR");
      expect(pre.failure.details?.[0]?.field).toBe("code");
    }

    vi.mocked(isProjectCodeTaken).mockResolvedValue(false);
    vi.mocked(insertProject).mockRejectedValue(
      new DbWriteError("unique_violation", "project_insert_failed_conflict", "23505"),
    );
    const raced = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      code: "AUR",
    });
    expect(raced.ok).toBe(false);
    if (!raced.ok) expect(raced.failure.code).toBe("VALIDATION_ERROR");
  });

  it("foreign managers are rejected; RLS denials fail closed to 403", async () => {
    vi.mocked(isProjectCodeTaken).mockResolvedValue(false);
    vi.mocked(isUserOrgMember).mockResolvedValue(false);
    const badManager = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      code: "AUR9",
      managerId: DEV_A2,
    });
    expect(badManager.ok).toBe(false);
    if (!badManager.ok) {
      expect(badManager.failure.code).toBe("VALIDATION_ERROR");
      expect(badManager.failure.details?.[0]?.field).toBe("managerId");
    }

    vi.mocked(isUserOrgMember).mockResolvedValue(true);
    vi.mocked(insertProject).mockRejectedValue(
      new DbWriteError("rls_denied", "project_insert_failed_denied", "42501"),
    );
    const denied = await createProject(client, ADMIN_SCOPE, {
      name: "Aurora",
      code: "AUR9",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.failure.code).toBe("FORBIDDEN");
  });
});

describe("updateProject authorization", () => {
  it("ADMIN/PM update accessible projects; DEVELOPER gets 403; foreign gets 404", async () => {
    vi.mocked(findAccessibleProjectById).mockResolvedValue({
      id: PROJECT_A,
      organization_id: ORG_A,
    });
    vi.mocked(updateProjectById).mockResolvedValue(
      projectRow({ status: "completed" }),
    );
    const ok = await updateProject(client, PM_SCOPE, PROJECT_A, {
      status: "completed",
    });
    expect(ok.ok).toBe(true);

    const dev = await updateProject(client, DEV_SCOPE, PROJECT_A, {
      status: "completed",
    });
    expect(dev.ok).toBe(false);
    if (!dev.ok) expect(dev.failure.code).toBe("FORBIDDEN");

    vi.mocked(findAccessibleProjectById).mockResolvedValue(null);
    const foreign = await updateProject(client, ADMIN_SCOPE, PROJECT_B, {
      status: "completed",
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.failure.code).toBe("NOT_FOUND");
  });

  it("organization transfer is denied; duplicate codes are 400; invalid UUIDs never reach the service", async () => {
    vi.mocked(findAccessibleProjectById).mockResolvedValue({
      id: PROJECT_A,
      organization_id: ORG_A,
    });
    const move = await updateProject(client, ADMIN_SCOPE, PROJECT_A, {
      organizationIdAttempt: ORG_B,
    });
    expect(move.ok).toBe(false);
    if (!move.ok) expect(move.failure.code).toBe("FORBIDDEN");

    vi.mocked(isProjectCodeTaken).mockResolvedValue(true);
    const dup = await updateProject(client, ADMIN_SCOPE, PROJECT_A, {
      code: "AUR",
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.failure.code).toBe("VALIDATION_ERROR");

    const empty = await updateProject(client, ADMIN_SCOPE, PROJECT_A, {});
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Requirement service authorization
// ---------------------------------------------------------------------------

describe("createRequirement authorization", () => {
  it("ADMIN creates with a server-generated display ID (201 path)", async () => {
    vi.mocked(findProjectRowById).mockResolvedValue(projectRow());
    vi.mocked(countRequirementsInProject).mockResolvedValue(7);
    vi.mocked(generateRequirementDisplayId).mockResolvedValue("AUR-008");
    vi.mocked(insertRequirement).mockResolvedValue(requirementRow());
    const result = await createRequirement(client, ADMIN_SCOPE, {
      projectId: PROJECT_A,
      title: "Login flow",
      category: "feature",
    });
    expect(result.ok).toBe(true);
    expect(vi.mocked(insertRequirement).mock.calls[0]?.[1]).toMatchObject({
      display_id: "AUR-008",
      project_id: PROJECT_A,
    });
  });

  it("DEVELOPER create is denied (403); foreign projects are 404", async () => {
    vi.mocked(findProjectRowById).mockResolvedValue(projectRow());
    const dev = await createRequirement(client, DEV_SCOPE, {
      projectId: PROJECT_A,
      title: "Login flow",
      category: "feature",
    });
    expect(dev.ok).toBe(false);
    if (!dev.ok) expect(dev.failure.code).toBe("FORBIDDEN");
    expect(vi.mocked(insertRequirement)).not.toHaveBeenCalled();

    vi.mocked(findProjectRowById).mockResolvedValue(null);
    const foreign = await createRequirement(client, ADMIN_SCOPE, {
      projectId: PROJECT_B,
      title: "Login flow",
      category: "feature",
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.failure.code).toBe("NOT_FOUND");
  });

  it("cross-org references are rejected (assignee, sprint, dependency)", async () => {
    vi.mocked(findProjectRowById).mockResolvedValue(projectRow());
    vi.mocked(isUserOrgMember).mockResolvedValue(false);
    const badAssignee = await createRequirement(client, ADMIN_SCOPE, {
      projectId: PROJECT_A,
      title: "T",
      category: "feature",
      assigneeId: DEV_A2,
    });
    expect(badAssignee.ok).toBe(false);
    if (!badAssignee.ok) {
      expect(badAssignee.failure.code).toBe("VALIDATION_ERROR");
      expect(badAssignee.failure.details?.[0]?.field).toBe("assigneeId");
    }

    vi.mocked(isUserOrgMember).mockResolvedValue(true);
    vi.mocked(findAccessibleSprintById).mockResolvedValue({
      id: SPRINT_B,
      project_id: PROJECT_B,
    });
    const badSprint = await createRequirement(client, ADMIN_SCOPE, {
      projectId: PROJECT_A,
      title: "T",
      category: "feature",
      sprintId: SPRINT_B,
    });
    expect(badSprint.ok).toBe(false);
    if (!badSprint.ok) {
      expect(badSprint.failure.code).toBe("VALIDATION_ERROR");
      expect(badSprint.failure.details?.[0]?.field).toBe("sprintId");
    }

    vi.mocked(findAccessibleSprintById).mockResolvedValue({
      id: SPRINT_A,
      project_id: PROJECT_A,
    });
    vi.mocked(findLinkedRequirementById).mockResolvedValue({
      id: "other",
      project_id: PROJECT_B,
    });
    const badDep = await createRequirement(client, ADMIN_SCOPE, {
      projectId: PROJECT_A,
      title: "T",
      category: "feature",
      sprintId: SPRINT_A,
      dependencyId: "0b02b57f-5771-4197-beef-1e9e5db4a22e",
    });
    expect(badDep.ok).toBe(false);
    if (!badDep.ok) {
      expect(badDep.failure.code).toBe("VALIDATION_ERROR");
      expect(badDep.failure.details?.[0]?.field).toBe("dependencyId");
    }
    expect(vi.mocked(insertRequirement)).not.toHaveBeenCalled();
  });
});

describe("updateRequirement authorization", () => {
  function accessibleProject() {
    vi.mocked(findRequirementRowById).mockResolvedValue(requirementRow());
    vi.mocked(findAccessibleProjectById).mockResolvedValue({
      id: PROJECT_A,
      organization_id: ORG_A,
    });
  }

  it("staff update any field incl. reassignment within the org", async () => {
    accessibleProject();
    vi.mocked(isUserOrgMember).mockResolvedValue(true);
    vi.mocked(updateRequirementById).mockResolvedValue(
      requirementRow({ status: "review", assignee_id: DEV_A2 }),
    );
    const result = await updateRequirement(client, PM_SCOPE, REQ_A, {
      status: "review",
      assigneeId: DEV_A2,
    });
    expect(result.ok).toBe(true);
    expect(vi.mocked(updateRequirementById).mock.calls[0]?.[2]).toMatchObject({
      status: "review",
      assignee_id: DEV_A2,
    });
  });

  it("developers edit own-assigned rows but cannot reassign or touch peers", async () => {
    accessibleProject();
    vi.mocked(updateRequirementById).mockResolvedValue(
      requirementRow({ status: "inProgress" }),
    );
    const own = await updateRequirement(client, DEV_SCOPE, REQ_A, {
      status: "inProgress",
      storyPoints: 5,
    });
    expect(own.ok).toBe(true);

    const reassign = await updateRequirement(client, DEV_SCOPE, REQ_A, {
      status: "review",
      assigneeId: DEV_A2,
    });
    expect(reassign.ok).toBe(false);
    if (!reassign.ok) expect(reassign.failure.code).toBe("FORBIDDEN");

    vi.mocked(findRequirementRowById).mockResolvedValue(
      requirementRow({ assignee_id: DEV_A2 }),
    );
    const peer = await updateRequirement(client, DEV_SCOPE, REQ_A, {
      status: "review",
    });
    expect(peer.ok).toBe(false);
    if (!peer.ok) expect(peer.failure.code).toBe("FORBIDDEN");
  });

  it("project/display moves are immutable; missing rows are 404", async () => {
    accessibleProject();
    const move = await updateRequirement(client, PM_SCOPE, REQ_A, {
      projectIdAttempt: PROJECT_B,
    });
    expect(move.ok).toBe(false);
    if (!move.ok) expect(move.failure.code).toBe("VALIDATION_ERROR");

    const display = await updateRequirement(client, PM_SCOPE, REQ_A, {
      displayIdAttempt: true,
      status: "review",
    });
    expect(display.ok).toBe(false);
    if (!display.ok) expect(display.failure.code).toBe("VALIDATION_ERROR");

    vi.mocked(findRequirementRowById).mockResolvedValue(null);
    const missing = await updateRequirement(client, PM_SCOPE, REQ_A, {
      status: "review",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failure.code).toBe("NOT_FOUND");
  });

  it("malformed path IDs are rejected before any database access", async () => {
    const { isUuid } = await import("../../src/schemas/query-params");
    for (const bad of ["", "1", "not-a-uuid", "x".repeat(36)]) {
      expect(isUuid(bad)).toBe(false);
    }
    expect(isUuid(REQ_A)).toBe(true);
    // Routes return 400 VALIDATION_ERROR on non-UUID ids, so the services
    // below must never be reached with one: assert no repo access happened.
    expect(vi.mocked(findRequirementRowById)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Static route + privilege scans (no DATABASE_URL / service-role on the lane)
// ---------------------------------------------------------------------------

describe("mutation route contract (static)", () => {
  const root = process.cwd();
  const routeFiles = [
    "src/app/api/projects/route.ts",
    "src/app/api/projects/[id]/route.ts",
    "src/app/api/requirements/route.ts",
    "src/app/api/requirements/[id]/route.ts",
  ];
  const laneFiles = [
    ...routeFiles,
    "src/api/response.ts",
    "src/api/auth.ts",
    "src/api/access.ts",
    "src/services/project.service.ts",
    "src/services/requirement.service.ts",
    "src/repositories/project.repository.ts",
    "src/repositories/requirement.repository.ts",
    "src/repositories/mutation-helpers.ts",
    "src/schemas/project-mutations.ts",
    "src/schemas/requirement-mutations.ts",
  ];

  it("every mutation route authenticates + derives scope server-side", () => {
    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      expect(content, `${file} must authenticate`).toMatch(
        /requireAuthenticatedContext/,
      );
      expect(content, `${file} must derive scope`).toMatch(
        /resolveRequestScope/,
      );
    }
  });

  it("mutation routes expose POST/PATCH only with canonical envelopes", () => {
    const projects = fs.readFileSync(
      path.join(root, "src/app/api/projects/route.ts"),
      "utf8",
    );
    expect(projects).toMatch(/export async function POST/);
    expect(projects).toMatch(/createdResponse/);
    const requirements = fs.readFileSync(
      path.join(root, "src/app/api/requirements/route.ts"),
      "utf8",
    );
    expect(requirements).toMatch(/export async function POST/);
    for (const file of [
      "src/app/api/projects/[id]/route.ts",
      "src/app/api/requirements/[id]/route.ts",
    ]) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      expect(content, `${file} must validate the path id`).toMatch(/isUuid/);
      expect(content, `${file} must expose PATCH`).toMatch(
        /export async function PATCH/,
      );
    }
  });

  it("user-facing lane never uses privileged credentials or pools", () => {
    for (const file of laneFiles) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      expect(content, `${file} must not use DATABASE_URL`).not.toMatch(
        /DATABASE_URL/,
      );
      expect(content, `${file} must not use service-role`).not.toMatch(
        /SERVICE_ROLE/,
      );
      expect(content, `${file} must not use the privileged pool`).not.toMatch(
        /@supabase\/client/,
      );
    }
  });

  it("mutation lane never trusts client-supplied identity", () => {
    for (const file of laneFiles) {
      const content = fs.readFileSync(path.join(root, file), "utf8");
      expect(content, `${file} must not read request roles`).not.toMatch(
        /body\??\.(role|userId|user_id)/,
      );
    }
    const createSchema = fs.readFileSync(
      path.join(root, "src/schemas/project-mutations.ts"),
      "utf8",
    );
    expect(createSchema).toMatch(/organizationIdHint/);
  });
});
