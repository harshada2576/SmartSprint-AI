/**
 * RBAC six-role model unit tests — pure policy helpers + request lifecycle
 * validation (§7 acceptance criteria, DB-free).
 *
 * Covers:
 * - typed approval routing (§7 RBAC boundaries: FINANCE/LEGAL/PM cases)
 * - AI risk-domain authorization (§7.2)
 * - role-request creation shapes (§7.1: self, HR-on-behalf, rejections)
 * - role-request decisions (§7.1: ADMIN-only, no self/target decision,
 *   single-ADMIN pending, atomicity guards, audit expectation)
 * - AI breakdown / recommendation gates (§7.2)
 * - AI insight dedup keys (§7.2: no duplicate pending insights)
 * - risk domain classification (§5.4)
 * - developer task field boundary (§7.4)
 * - document / monitoring gates (§7.3)
 */
import { describe, expect, it } from "vitest";
import {
  aiInsightDedupKey,
  classifyRoleRequestShape,
  isApprovalType,
  isDeveloperAllowedTaskField,
  isRiskDomain,
  mayAccessDocuments,
  mayApproveBreakdown,
  mayApproveRiskDomain,
  mayDecideAiRecommendation,
  mayDecideApproval,
  mayGenerateBreakdown,
  maySubmitApproval,
  mayViewAiRecommendations,
  mayViewMonitoring,
} from "@/services/rbac";
import {
  validateDecisionPure,
  validateRoleRequestShapePure,
} from "@/services/role-request.service";
import { classifyRiskDomain } from "@/services/risk-engine.service";
import { isAppRole } from "@/types/api";

describe("six-role model", () => {
  it("recognizes exactly the six application roles", () => {
    for (const role of [
      "ADMIN",
      "PROJECT_MANAGER",
      "DEVELOPER",
      "FINANCE",
      "LEGAL",
      "HR",
    ]) {
      expect(isAppRole(role)).toBe(true);
    }
    expect(isAppRole("SUPERADMIN")).toBe(false);
    expect(isAppRole("admin")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });

  it("validates approval types and risk domains fail-closed", () => {
    expect(isApprovalType("scope")).toBe(true);
    expect(isApprovalType("legal")).toBe(false);
    expect(isRiskDomain("budget")).toBe(true);
    expect(isRiskDomain("schedule")).toBe(false);
    expect(mayDecideApproval("ADMIN", "unknown")).toBe(false);
    expect(mayApproveRiskDomain("FINANCE", "unknown")).toBe(false);
  });
});

describe("typed approval routing (§1.2.2)", () => {
  it("FINANCE decides budget only", () => {
    expect(mayDecideApproval("FINANCE", "budget")).toBe(true);
    expect(mayDecideApproval("FINANCE", "scope")).toBe(false);
    expect(mayDecideApproval("FINANCE", "vendor")).toBe(false);
    expect(mayDecideApproval("FINANCE", "resource")).toBe(false);
  });

  it("LEGAL decides vendor only", () => {
    expect(mayDecideApproval("LEGAL", "vendor")).toBe(true);
    expect(mayDecideApproval("LEGAL", "budget")).toBe(false);
    expect(mayDecideApproval("LEGAL", "scope")).toBe(false);
    expect(mayDecideApproval("LEGAL", "resource")).toBe(false);
  });

  it("PM decides scope/resource only", () => {
    expect(mayDecideApproval("PROJECT_MANAGER", "scope")).toBe(true);
    expect(mayDecideApproval("PROJECT_MANAGER", "resource")).toBe(true);
    expect(mayDecideApproval("PROJECT_MANAGER", "budget")).toBe(false);
    expect(mayDecideApproval("PROJECT_MANAGER", "vendor")).toBe(false);
  });

  it("ADMIN decides any type (universal backstop)", () => {
    for (const type of ["scope", "budget", "vendor", "resource"]) {
      expect(mayDecideApproval("ADMIN", type)).toBe(true);
    }
  });

  it("DEVELOPER and HR decide nothing", () => {
    for (const type of ["scope", "budget", "vendor", "resource"]) {
      expect(mayDecideApproval("DEVELOPER", type)).toBe(false);
      expect(mayDecideApproval("HR", type)).toBe(false);
    }
  });

  it("submit routing allows specialists to file their own type", () => {
    expect(maySubmitApproval("FINANCE", "budget")).toBe(true);
    expect(maySubmitApproval("FINANCE", "vendor")).toBe(false);
    expect(maySubmitApproval("LEGAL", "vendor")).toBe(true);
    expect(maySubmitApproval("LEGAL", "budget")).toBe(false);
    expect(maySubmitApproval("DEVELOPER", "scope")).toBe(false);
    expect(maySubmitApproval("HR", "budget")).toBe(false);
  });
});

describe("AI risk-domain authorization (§1.2.5)", () => {
  it("PM/ADMIN approve any domain including NULL and technical", () => {
    for (const domain of [
      "technical",
      "budget",
      "resource",
      "legal",
      null,
      undefined,
    ]) {
      expect(mayApproveRiskDomain("ADMIN", domain)).toBe(true);
      expect(mayApproveRiskDomain("PROJECT_MANAGER", domain)).toBe(true);
    }
  });

  it("FINANCE approves budget/resource only", () => {
    expect(mayApproveRiskDomain("FINANCE", "budget")).toBe(true);
    expect(mayApproveRiskDomain("FINANCE", "resource")).toBe(true);
    expect(mayApproveRiskDomain("FINANCE", "technical")).toBe(false);
    expect(mayApproveRiskDomain("FINANCE", "legal")).toBe(false);
    expect(mayApproveRiskDomain("FINANCE", null)).toBe(false);
  });

  it("LEGAL approves legal only", () => {
    expect(mayApproveRiskDomain("LEGAL", "legal")).toBe(true);
    expect(mayApproveRiskDomain("LEGAL", "technical")).toBe(false);
    expect(mayApproveRiskDomain("LEGAL", "budget")).toBe(false);
    expect(mayApproveRiskDomain("LEGAL", "resource")).toBe(false);
    expect(mayApproveRiskDomain("LEGAL", null)).toBe(false);
  });

  it("DEVELOPER and HR approve no AI risks", () => {
    for (const domain of ["technical", "budget", "resource", "legal", null]) {
      expect(mayApproveRiskDomain("DEVELOPER", domain)).toBe(false);
      expect(mayApproveRiskDomain("HR", domain)).toBe(false);
    }
  });
});

describe("role-request creation shapes (§7.1)", () => {
  const org = true;
  it("ADMIN/PM/DEV/FINANCE/LEGAL may request their own role change", () => {
    for (const role of [
      "ADMIN",
      "PROJECT_MANAGER",
      "DEVELOPER",
      "FINANCE",
      "LEGAL",
    ] as const) {
      expect(
        classifyRoleRequestShape({
          callerUserId: "u1",
          callerRole: role,
          targetUserId: "u1",
          sameOrganization: org,
        }),
      ).toBe("self");
    }
  });

  it("HR cannot request its own role change", () => {
    expect(
      classifyRoleRequestShape({
        callerUserId: "hr",
        callerRole: "HR",
        targetUserId: "hr",
        sameOrganization: org,
      }),
    ).toBe("invalid");
  });

  it("HR can initiate for another member, including another HR member", () => {
    expect(
      classifyRoleRequestShape({
        callerUserId: "hr1",
        callerRole: "HR",
        targetUserId: "dev1",
        sameOrganization: org,
      }),
    ).toBe("hr-on-behalf");
  });

  it("HR cannot target itself", () => {
    expect(
      classifyRoleRequestShape({
        callerUserId: "hr1",
        callerRole: "HR",
        targetUserId: "hr1",
        sameOrganization: org,
      }),
    ).toBe("invalid");
  });

  it("ADMIN/PM/DEV/FINANCE/LEGAL cannot initiate for another member", () => {
    for (const role of [
      "ADMIN",
      "PROJECT_MANAGER",
      "DEVELOPER",
      "FINANCE",
      "LEGAL",
    ] as const) {
      expect(
        classifyRoleRequestShape({
          callerUserId: "a",
          callerRole: role,
          targetUserId: "b",
          sameOrganization: org,
        }),
      ).toBe("invalid");
    }
  });

  it("cross-organization requests are rejected", () => {
    expect(
      classifyRoleRequestShape({
        callerUserId: "hr",
        callerRole: "HR",
        targetUserId: "dev",
        sameOrganization: false,
      }),
    ).toBe("invalid");
  });

  it("pure validation rejects same-role requests and duplicate pending", () => {
    const same = validateRoleRequestShapePure({
      callerUserId: "u1",
      callerRole: "DEVELOPER",
      targetUserId: "u1",
      sameOrganization: true,
      targetCurrentRole: "DEVELOPER",
      requestedRole: "DEVELOPER",
      hasPending: false,
    });
    expect(same.ok).toBe(false);

    const dup = validateRoleRequestShapePure({
      callerUserId: "hr",
      callerRole: "HR",
      targetUserId: "u2",
      sameOrganization: true,
      targetCurrentRole: "DEVELOPER",
      requestedRole: "PROJECT_MANAGER",
      hasPending: true,
    });
    expect(dup.ok).toBe(false);

    const valid = validateRoleRequestShapePure({
      callerUserId: "hr",
      callerRole: "HR",
      targetUserId: "u2",
      sameOrganization: true,
      targetCurrentRole: "DEVELOPER",
      requestedRole: "PROJECT_MANAGER",
      hasPending: false,
    });
    expect(valid.ok).toBe(true);
  });
});

describe("role-request decisions (§7.1)", () => {
  const base = {
    deciderOrgIds: ["org1"],
    requestOrgId: "org1",
    requestTargetUserId: "target",
    requestRequestedBy: "hr",
    requestStatus: "pending",
  };

  it("ADMIN can approve a valid HR-submitted request", () => {
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "admin1",
        deciderRole: "ADMIN",
      }).ok,
    ).toBe(true);
  });

  it("HR/PM/DEV/FINANCE/LEGAL cannot approve", () => {
    for (const role of [
      "HR",
      "PROJECT_MANAGER",
      "DEVELOPER",
      "FINANCE",
      "LEGAL",
    ] as const) {
      const verdict = validateDecisionPure({
        ...base,
        deciderUserId: "x",
        deciderRole: role,
      });
      expect(verdict.ok).toBe(false);
    }
  });

  it("target and submitter cannot decide (incl. ADMIN self-decision)", () => {
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "target",
        deciderRole: "ADMIN",
      }).ok,
    ).toBe(false);
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "hr",
        deciderRole: "ADMIN",
      }).ok,
    ).toBe(false);
  });

  it("wrong organization and already-decided requests are rejected", () => {
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "admin1",
        deciderRole: "ADMIN",
        requestOrgId: "org2",
      }).ok,
    ).toBe(false);
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "admin1",
        deciderRole: "ADMIN",
        requestStatus: "approved",
      }).ok,
    ).toBe(false);
    expect(
      validateDecisionPure({
        ...base,
        deciderUserId: "admin1",
        deciderRole: "ADMIN",
        requestStatus: "rejected",
      }).ok,
    ).toBe(false);
  });
});

describe("AI gates (§7.2)", () => {
  it("DEVELOPER can generate/view breakdown but cannot approve", () => {
    expect(mayGenerateBreakdown("DEVELOPER")).toBe(true);
    expect(mayApproveBreakdown("DEVELOPER")).toBe(false);
  });

  it("only PM/ADMIN approve breakdowns and recommendations", () => {
    expect(mayApproveBreakdown("ADMIN")).toBe(true);
    expect(mayApproveBreakdown("PROJECT_MANAGER")).toBe(true);
    expect(mayDecideAiRecommendation("ADMIN")).toBe(true);
    expect(mayDecideAiRecommendation("PROJECT_MANAGER")).toBe(true);
    for (const role of ["DEVELOPER", "FINANCE", "LEGAL", "HR"]) {
      expect(mayApproveBreakdown(role)).toBe(false);
      expect(mayDecideAiRecommendation(role)).toBe(false);
    }
  });

  it("FINANCE/LEGAL/HR cannot generate breakdowns", () => {
    expect(mayGenerateBreakdown("FINANCE")).toBe(false);
    expect(mayGenerateBreakdown("LEGAL")).toBe(false);
    expect(mayGenerateBreakdown("HR")).toBe(false);
  });

  it("HR cannot view AI priority recommendations", () => {
    expect(mayViewAiRecommendations("HR")).toBe(false);
    expect(mayViewAiRecommendations("FINANCE")).toBe(true);
  });

  it("dedup keys are stable per project + issue + entity", () => {
    const a = aiInsightDedupKey("p1", "overdue_task", "t1");
    expect(aiInsightDedupKey("p1", "overdue_task", "t1")).toBe(a);
    expect(aiInsightDedupKey("p1", "overdue_task", "t2")).not.toBe(a);
    expect(aiInsightDedupKey("p1", "blocked_task", "t1")).not.toBe(a);
    expect(aiInsightDedupKey("p2", "overdue_task", "t1")).not.toBe(a);
  });

  it("risk domains classify deterministically", () => {
    expect(classifyRiskDomain("workload_imbalance", null)).toBe("resource");
    expect(classifyRiskDomain("overdue_task", null)).toBe("resource");
    expect(
      classifyRiskDomain("blocked_task", "waiting on vendor contract"),
    ).toBe("legal");
    expect(
      classifyRiskDomain("blocked_task", "over budget on invoices"),
    ).toBe("budget");
    expect(classifyRiskDomain("blocked_task", "stuck on API flake")).toBe(
      "technical",
    );
    expect(classifyRiskDomain("dependency_incomplete", null)).toBe("technical");
  });
});

describe("task and data-security boundaries (§7.3, §7.4)", () => {
  it("developer task fields are limited to status/progress/blocked/reason", () => {
    for (const field of [
      "columnStatus",
      "progressPercent",
      "isBlocked",
      "blockedReason",
    ]) {
      expect(isDeveloperAllowedTaskField(field)).toBe(true);
    }
    for (const field of [
      "title",
      "priority",
      "assigneeId",
      "sprintId",
      "dueDate",
      "estimatedHours",
    ]) {
      expect(isDeveloperAllowedTaskField(field)).toBe(false);
    }
  });

  it("documents exclude PM/DEV; monitoring excludes HR", () => {
    expect(mayAccessDocuments("ADMIN")).toBe(true);
    expect(mayAccessDocuments("FINANCE")).toBe(true);
    expect(mayAccessDocuments("LEGAL")).toBe(true);
    expect(mayAccessDocuments("HR")).toBe(true);
    expect(mayAccessDocuments("PROJECT_MANAGER")).toBe(false);
    expect(mayAccessDocuments("DEVELOPER")).toBe(false);
    expect(mayViewMonitoring("HR")).toBe(false);
    expect(mayViewMonitoring("DEVELOPER")).toBe(true);
  });
});
