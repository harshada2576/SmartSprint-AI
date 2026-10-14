/**
 * Notifications / documents / team contract tests (STATIC — no database).
 *
 * Pins the Phase 6 completion fixes:
 * - Migration 0010 adds additive nullable entity-link columns to
 *   `notifications`, mirrored in `supabase/schema.ts` and the repository
 *   select; `normalizeNotification` passes them through so inbox actions
 *   navigate to the real entity.
 * - All three server-side notification inserts populate the entity link.
 * - The inbox action handler always navigates somewhere real (no dead
 *   buttons, no per-entity 404 routes); the TopNavigation bell navigates
 *   and shows the unread dot only with a live unread count.
 * - Document metadata creation uses a server-generated storage path and
 *   a 50MB cap (client-supplied paths are never trusted).
 * - The team page offers all six roles and counts/lists pending
 *   invitations truthfully.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { notifications } from "@supabase/schema";
import {
  normalizeNotification,
} from "../../src/lib/api-client";

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const NOTIFICATIONS_PAGE = readSource(
  "src",
  "app",
  "notifications",
  "page.tsx",
);
const TASK_ROUTE = readSource("src", "app", "api", "tasks", "[id]", "route.ts");
const COMMENTS_ROUTE = readSource(
  "src",
  "app",
  "api",
  "tasks",
  "[id]",
  "comments",
  "route.ts",
);
const SPRINT_START_ROUTE = readSource(
  "src",
  "app",
  "api",
  "sprints",
  "[id]",
  "start",
  "route.ts",
);
const DOCUMENTS_ROUTE = readSource(
  "src",
  "app",
  "api",
  "documents",
  "route.ts",
);
const TEAM_PAGE = readSource("src", "app", "team", "page.tsx");
const TOP_NAV = readSource(
  "src",
  "components",
  "layout",
  "TopNavigation.tsx",
);

describe("notification entity linkage", () => {
  it("migration 0010 adds additive nullable link columns", () => {
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "0010_notification_entity_links.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS entity_type/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS entity_id/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS action_url/);
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });

  it("schema.ts and the repository expose the link columns", () => {
    expect(Object.keys(notifications)).toEqual(
      expect.arrayContaining(["entityType", "entityId", "actionUrl"]),
    );
    const repo = readSource(
      "src",
      "repositories",
      "notification.repository.ts",
    );
    expect(repo).toMatch(/entity_type,entity_id,action_url/);
  });

  it("all three server-side inserts populate the entity link", () => {
    for (const [label, src] of [
      ["task blocked", TASK_ROUTE],
      ["comment", COMMENTS_ROUTE],
      ["sprint start", SPRINT_START_ROUTE],
    ] as const) {
      expect(src, `${label}: entityType`).toMatch(/entityType:/);
      expect(src, `${label}: entityId`).toMatch(/entityId:/);
      expect(src, `${label}: actionUrl`).toMatch(/actionUrl:/);
    }
  });

  it("normalizeNotification passes the link through (snake + camel)", () => {
    const item = normalizeNotification({
      id: "n1",
      type: "task",
      entity_type: "task",
      entity_id: "t1",
      action_url: "/tasks/t1",
    });
    expect(item?.entityType).toBe("task");
    expect(item?.entityId).toBe("t1");
    expect(item?.actionUrl).toBe("/tasks/t1");
  });

  it("the inbox handler never dead-ends and avoids missing detail routes", () => {
    expect(NOTIFICATIONS_PAGE).not.toMatch(/\/approvals\/\$\{/);
    expect(NOTIFICATIONS_PAGE).not.toMatch(/\/documents\/\$\{entityId\}/);
    // Terminal fallback exists after the legacy branches.
    expect(NOTIFICATIONS_PAGE).toMatch(/Terminal fallback/);
    expect(NOTIFICATIONS_PAGE).toMatch(/router\.push\("\/dashboard"\)/);
    expect(NOTIFICATIONS_PAGE).toMatch(/router\.push\("\/governance"\)/);
  });

  it("the TopNavigation bell navigates and gates the dot on live state", () => {
    expect(TOP_NAV).toMatch(/router\.push\("\/notifications"\)/);
    expect(TOP_NAV).toMatch(/unreadCount > 0 &&/);
    expect(TOP_NAV).toMatch(/\/api\/notifications\?page=1&pageSize=1/);
  });
});

describe("document upload safety", () => {
  it("generates the storage path server-side with a size cap", () => {
    expect(DOCUMENTS_ROUTE).toMatch(/buildStoragePath/);
    expect(DOCUMENTS_ROUTE).toMatch(/MAX_FILE_SIZE_BYTES/);
    expect(DOCUMENTS_ROUTE).toMatch(/randomUUID/);
    // Client-supplied paths are no longer accepted.
    expect(DOCUMENTS_ROUTE).not.toMatch(/body\.storagePath/);
  });
});

describe("team page truthfulness", () => {
  it("offers all six roles in filter and invite controls", () => {
    for (const role of [
      "ADMIN",
      "PROJECT_MANAGER",
      "DEVELOPER",
      "FINANCE",
      "LEGAL",
      "HR",
    ]) {
      expect(TEAM_PAGE).toMatch(new RegExp(`value="${role}"`));
    }
  });

  it("counts and lists pending invitations only", () => {
    expect(TEAM_PAGE).toMatch(/pendingInvitations/);
    expect(TEAM_PAGE).toMatch(/inv\.status === "pending"/);
  });
});
