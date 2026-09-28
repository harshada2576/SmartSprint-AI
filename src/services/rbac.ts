import type { AppRole } from "@/types/api";
import { isStaffRole } from "@/types/api";

/**
 * Central RBAC policy helpers — pure functions shared by API routes and
 * services. Every helper is fail-closed (unknown inputs deny).
 *
 * Ownership: Backend/API agent (`src/services/**`).
 */

export type ApprovalType = "scope" | "budget" | "vendor" | "resource";
export type RiskDomain = "technical" | "budget" | "legal" | "resource";

const APPROVAL_TYPES: ReadonlySet<string> = new Set([
  "scope",
  "budget",
  "vendor",
  "resource",
]);

const RISK_DOMAINS: ReadonlySet<string> = new Set([
  "technical",
  "budget",
  "legal",
  "resource",
]);

export function isApprovalType(value: unknown): value is ApprovalType {
  return typeof value === "string" && APPROVAL_TYPES.has(value);
}

export function isRiskDomain(value: unknown): value is RiskDomain {
  return typeof value === "string" && RISK_DOMAINS.has(value);
}

/** Who may submit each approval type. */
export function maySubmitApproval(
  role: AppRole | undefined | string,
  type: ApprovalType | string,
): boolean {
  if (!isApprovalType(type)) return false;
  if (role === "ADMIN") return true;
  switch (type) {
    case "scope":
    case "resource":
      return role === "PROJECT_MANAGER";
    case "budget":
      return role === "PROJECT_MANAGER" || role === "FINANCE";
    case "vendor":
      return role === "PROJECT_MANAGER" || role === "LEGAL";
    default:
      return false;
  }
}

/**
 * Typed approval routing — who may decide each approval type.
 * ADMIN is the universal backstop and may decide any type.
 */
export function mayDecideApproval(
  role: AppRole | undefined | string,
  type: ApprovalType | string,
): boolean {
  if (!isApprovalType(type)) return false;
  if (role === "ADMIN") return true;
  switch (type) {
    case "scope":
    case "resource":
      return role === "PROJECT_MANAGER";
    case "budget":
      return role === "FINANCE";
    case "vendor":
      return role === "LEGAL";
    default:
      return false;
  }
}

/**
 * AI-flagged / specialist risk approval by domain.
 * - ADMIN / PROJECT_MANAGER: any domain (including NULL/technical).
 * - FINANCE: budget or resource only.
 * - LEGAL: legal only.
 * - DEVELOPER / HR / unknown: never.
 * - NULL or technical domain: PM/ADMIN only.
 */
export function mayApproveRiskDomain(
  role: AppRole | undefined | string,
  riskDomain: RiskDomain | string | null | undefined,
): boolean {
  if (role === "ADMIN" || role === "PROJECT_MANAGER") return true;
  if (riskDomain == null) return false;
  if (!isRiskDomain(riskDomain)) return false;
  if (role === "FINANCE") {
    return riskDomain === "budget" || riskDomain === "resource";
  }
  if (role === "LEGAL") {
    return riskDomain === "legal";
  }
  return false;
}

/** AI breakdown generation: ADMIN, PM may generate; DEV may view/use. */
export function mayGenerateBreakdown(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "DEVELOPER"
  );
}

/** AI breakdown approval into real project state: ADMIN/PM only. */
export function mayApproveBreakdown(
  role: AppRole | undefined | string,
): boolean {
  return isStaffRole(role as AppRole);
}

/** AI priority recommendation decision: ADMIN/PM only. */
export function mayDecideAiRecommendation(
  role: AppRole | undefined | string,
): boolean {
  return isStaffRole(role as AppRole);
}

/** Document access: ADMIN, FINANCE, LEGAL, HR. No PM/DEV. */
export function mayAccessDocuments(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" ||
    role === "FINANCE" ||
    role === "LEGAL" ||
    role === "HR"
  );
}

/** Governance budget/contract edit: ADMIN, PM, FINANCE (LEGAL read-only). */
export function mayEditBudgetContracts(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "FINANCE"
  );
}

/** Governance budget/contract view: ADMIN, PM, FINANCE, LEGAL. */
export function mayViewBudgetContracts(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "FINANCE" ||
    role === "LEGAL"
  );
}

/** Milestone edit: ADMIN, PM, FINANCE. View adds DEV + LEGAL. */
export function mayEditMilestones(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "FINANCE"
  );
}

export function mayViewMilestones(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "DEVELOPER" ||
    role === "FINANCE" ||
    role === "LEGAL"
  );
}

/** Monitoring/reports view: everyone except HR. */
export function mayViewMonitoring(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "DEVELOPER" ||
    role === "FINANCE" ||
    role === "LEGAL"
  );
}

/** AI Assistant: all six roles (scope enforced separately). */
export function mayUseAssistant(
  role: AppRole | undefined | string,
): boolean {
  return (
    role === "ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "DEVELOPER" ||
    role === "FINANCE" ||
    role === "LEGAL" ||
    role === "HR"
  );
}

/** AI priority recommendation view: everyone except HR. */
export function mayViewAiRecommendations(
  role: AppRole | undefined | string,
): boolean {
  return mayViewMonitoring(role);
}

// ---------------------------------------------------------------------------
// Role-change request shapes (pure validation, §2.4)
// ---------------------------------------------------------------------------

export type RoleRequestShape = "self" | "hr-on-behalf" | "invalid";

export interface RoleRequestShapeInput {
  callerUserId: string;
  callerRole: AppRole | undefined | string;
  targetUserId: string;
  sameOrganization: boolean;
}

/**
 * Classifies a role-change creation attempt into exactly two valid shapes:
 * - self-request (requested_by = user_id, caller role != HR)
 * - HR-on-behalf (caller is HR, target differs, same org)
 * Everything else is invalid (ADMIN/PM/DEV/FINANCE/LEGAL on-behalf, HR
 * self-request, cross-org).
 */
export function classifyRoleRequestShape(
  input: RoleRequestShapeInput,
): RoleRequestShape {
  const { callerUserId, callerRole, targetUserId, sameOrganization } = input;
  if (!sameOrganization) return "invalid";
  if (callerUserId === targetUserId) {
    // Self-request: allowed for every role except HR.
    if (callerRole === "HR") return "invalid";
    if (
      callerRole === "ADMIN" ||
      callerRole === "PROJECT_MANAGER" ||
      callerRole === "DEVELOPER" ||
      callerRole === "FINANCE" ||
      callerRole === "LEGAL"
    ) {
      return "self";
    }
    return "invalid";
  }
  // On-behalf: only HR, never targeting itself (already excluded above).
  if (callerRole === "HR") return "hr-on-behalf";
  return "invalid";
}

/**
 * Deduplication equivalence key for AI insights:
 * `project_id + issue_type + entity_id`.
 */
export function aiInsightDedupKey(
  projectId: string,
  issueType: string,
  entityId: string | null | undefined,
): string {
  return `${projectId}::${issueType}::${entityId ?? "-"}`;
}

/** Developer task PATCH allowlist (own assigned tasks only). */
const DEV_TASK_FIELDS: ReadonlySet<string> = new Set([
  "columnStatus",
  "status",
  "progressPercent",
  "progress_percent",
  "isBlocked",
  "is_blocked",
  "blockedReason",
  "blocked_reason",
]);

export function isDeveloperAllowedTaskField(field: string): boolean {
  return DEV_TASK_FIELDS.has(field);
}
