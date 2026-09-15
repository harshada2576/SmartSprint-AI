/**
 * Deterministic security fixtures for SmartSprint AI RLS tests.
 *
 * Source: seed/*.json (authoritative) + docs/database/auth-rls-test-plan.md §2.
 * This module does NOT modify seed data. It pins stable UUIDs verified against
 * the committed seed and provides runtime resolvers so tests stay deterministic
 * even if volatile row IDs change.
 *
 * Role model (sole source: organization_members.role):
 *   ADMIN | PROJECT_MANAGER | DEVELOPER — org-scoped, never global.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const ORG_A = "382db5f8-3744-4915-8dca-59e55fce3229"; // Nimbus Software Solutions
export const ORG_B = "23b6b6c9-c0c0-42d7-9b32-a2e93292696a"; // Beacon Digital Ventures
export const ORG_C = "716560fb-6bd4-4481-b5b7-07d68a9ad7c1"; // Coral Reef Analytics

/** ADMIN in Org A, DEVELOPER in Org B — proves roles are org-scoped. */
export const ADMIN_A = "462fd273-1ab0-4595-b54d-88a0532a69e6";
/** PROJECT_MANAGER in Org A, no other membership. */
export const PM_A = "a1244bef-a8ab-4f35-b87e-02c136833113";
/** ADMIN in Org B only — cross-org admin, must still get zero Org A rows. */
export const ADMIN_B = "06d03d9d-6447-4f26-9e1b-0e02d83095b2";
/** DEVELOPER in all three orgs — per-org visibility without blending. */
export const MULTI_DEV = "21f08f45-030c-46c1-90d6-07a1c2d387f7";
/** DEVELOPER in Org A, member of ORG_A_PROJECT, owns OWN_TASK_A1. */
export const DEV_A1 = "eb17277f-a94c-4ac5-a9af-69d3a84cff32";
/** DEVELOPER in Org A, member of ORG_A_PROJECT, owns PEER_TASK_A2. */
export const DEV_A2 = "e06e6d64-62ff-415f-9e0a-675ab3a823db";

/** Authenticated identity with zero organization_members rows (fail-closed). */
export const OUTSIDER_SUB = "11111111-1111-4111-8111-111111111111";

/** Org A project (Aurora Customer Portal), managed by PM_A. */
export const ORG_A_PROJECT = "2a47513a-1d92-4e85-8f1d-23b55a1cf476";
/** Org B project (Ledger Reconciliation Suite). */
export const ORG_B_PROJECT = "6d07eed1-130c-497e-8db9-04f2f49f0ef1";

/** Sprint inside ORG_A_PROJECT. */
export const ORG_A_SPRINT = "c9c5e39c-148b-4be9-8b18-45acc690d9b4";
/** Sprint inside ORG_B_PROJECT. */
export const ORG_B_SPRINT = "b7f09ef6-de5f-49eb-ac6b-70bc8de66f21";

/** Requirement AUR-001 inside ORG_A_PROJECT. */
export const ORG_A_REQUIREMENT = "43951991-a533-4255-85b0-e354c59a317e";
/** Requirement LED-001 inside ORG_B_PROJECT. */
export const ORG_B_REQUIREMENT = "0b02b57f-5771-4197-beef-1e9e5db4a22e";

/** Task AUR-T002 in ORG_A_PROJECT assigned to DEV_A1 (own-task fixture). */
export const OWN_TASK_A1 = "7c32bf78-8bca-47f2-8510-20833bec9421";
/** Task in ORG_A_PROJECT assigned to DEV_A2 (peer-task fixture). */
export const PEER_TASK_A2 = "9875ae4b-ef28-4cfc-944b-d6380457ad14";
/** Unassigned task (assignee_id IS NULL) in ORG_A_PROJECT. */
export const UNASSIGNED_TASK_A = "032daecc-9162-4aaa-a64e-75db2b6d30f9";
/** Task inside ORG_B_PROJECT (cross-org negative fixture). */
export const ORG_B_TASK = "7619c55c-e6c1-4878-b6a2-9e1b2cebd19f";

/** Folder inside ORG_A_PROJECT. */
export const ORG_A_FOLDER = "0f108098-14c2-43d5-be6a-22d00525df68";
/** Folder inside ORG_B_PROJECT. */
export const ORG_B_FOLDER = "5f42283c-1621-47bb-8521-fac050da7c43";

/** Document inside ORG_A_PROJECT (folder ORG_A_FOLDER). */
export const ORG_A_DOCUMENT = "17dbddea-b051-47ad-8723-136c44ae061f";
/** Document inside ORG_B_PROJECT (folder ORG_B_FOLDER). */
export const ORG_B_DOCUMENT = "a4c2fe81-0c29-4b15-9c56-0151370b8ef6";

/** Governance rows inside ORG_A_PROJECT. */
export const ORG_A_BUDGET = "01952ae4-242a-4d97-9323-ef341ba61810";
export const ORG_A_APPROVAL_PENDING = "d2a51bc1-3a6a-4585-a82c-05df40350d2a";
export const ORG_A_RISK = "079f120c-f6f2-48c9-a48c-9de7ab00b9ba";
export const ORG_A_CHANGE_REQUEST = "7e42eb9e-5a06-453a-a65c-d22c094c6887";
export const ORG_A_MILESTONE = "7daec24c-477c-48b9-9afa-5c4245daa5d9";
export const ORG_A_CONTRACT = "01991ebb-6e2b-45fc-b9fa-8f4068e42375";

/** Two notifications belonging to two different users (inbox isolation). */
export const NOTIF_USER_1 = "5bbd91b2-ba7d-46c4-8337-14a0bef12efc";
export const NOTIF_1 = "ec166157-acbe-453e-9309-5e8a278f470d";
export const NOTIF_USER_2 = "3a7ee03a-24aa-419f-959a-297e87e79b28";
export const NOTIF_2 = "5a5f6b52-b7f9-4990-af22-e48fed138759";

/** Pending invitation in Org A. */
export const ORG_A_INVITE_PENDING = "3e48f8da-3d85-485b-8fbd-2fb5d2ff8671";

/** Activity log scoped to Org A. */
export const ORG_A_ACTIVITY_LOG = "c2029f69-5b8f-4520-bfc0-0afdaf579166";

export type OrgRole = "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER";

export interface Actor {
  /** Human-readable label used in every test title. */
  label: string;
  sub: string;
  orgId: string;
  role: OrgRole | "NONE";
}

export const ACTORS = {
  adminAinA: { label: "adminA@OrgA", sub: ADMIN_A, orgId: ORG_A, role: "ADMIN" } as Actor,
  adminAinB: { label: "adminA@OrgB", sub: ADMIN_A, orgId: ORG_B, role: "DEVELOPER" } as Actor,
  pmA: { label: "pmA@OrgA", sub: PM_A, orgId: ORG_A, role: "PROJECT_MANAGER" } as Actor,
  devA1: { label: "devA1@OrgA", sub: DEV_A1, orgId: ORG_A, role: "DEVELOPER" } as Actor,
  devA2: { label: "devA2@OrgA", sub: DEV_A2, orgId: ORG_A, role: "DEVELOPER" } as Actor,
  adminB: { label: "adminB@OrgB", sub: ADMIN_B, orgId: ORG_B, role: "ADMIN" } as Actor,
  multiDevA: { label: "multiDev@OrgA", sub: MULTI_DEV, orgId: ORG_A, role: "DEVELOPER" } as Actor,
  outsider: { label: "outsider(no-membership)", sub: OUTSIDER_SUB, orgId: ORG_A, role: "NONE" } as Actor,
};

/** Standard one-line security-case label: actor | org | role | op | target → expected. */
export function formatCase(
  actor: Actor,
  operation: string,
  target: string,
  expected: string,
): string {
  return `[${actor.label} | org=${shortId(actor.orgId)} | role=${actor.role} | ${operation} ${target} → ${expected}]`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Seed loaders (deterministic; read-only; never invent replacement users)
// ---------------------------------------------------------------------------

function seedPath(file: string): string {
  return path.join(process.cwd(), "seed", file);
}

export function loadSeedTable<T = Record<string, unknown>>(file: string): T[] {
  const raw = fs.readFileSync(seedPath(file), "utf8");
  return JSON.parse(raw) as T[];
}

export function seedMembershipRole(userId: string, orgId: string): OrgRole | "NONE" {
  const members = loadSeedTable<{ organization_id: string; user_id: string; role: string }>(
    "organization_members.json",
  );
  const row = members.find((m) => m.user_id === userId && m.organization_id === orgId);
  if (!row) return "NONE";
  return row.role as OrgRole;
}

export function seedProjectsByOrg(orgId: string): Array<{ id: string; organization_id: string }> {
  return loadSeedTable<{ id: string; organization_id: string }>("projects.json").filter(
    (p) => p.organization_id === orgId,
  );
}
