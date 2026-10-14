/**
 * Monitoring/report data-contract tests (STATIC — no database required).
 *
 * Pins the page↔API key alignment fixed in Phase 6 completion:
 * - `/api/monitoring/[projectId]` emits the aliased keys the monitoring
 *   page renders (`details`, `capacityPoints`/`usedPoints`,
 *   `totalTasks`/`completedTasks`, `name`/`activeTasks`/`completedTasks`,
 *   `severity`), guards invalid dates, and shares the page's 80/55
 *   health bands.
 * - Both report routes validate UUID ids, use the canonical error
 *   envelope (no `error.message` leaks), and resolve developer names
 *   with a scoped `inArray` lookup instead of a full users-table scan.
 * - The risks page normalizes snake_case rows to camelCase.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const MONITORING_ROUTE = readSource(
  "src",
  "app",
  "api",
  "monitoring",
  "[projectId]",
  "route.ts",
);
const MONITORING_PAGE = readSource("src", "app", "monitoring", "page.tsx");
const PROJECT_REPORT = readSource(
  "src",
  "app",
  "api",
  "reports",
  "project",
  "[id]",
  "route.ts",
);
const SPRINT_REPORT = readSource(
  "src",
  "app",
  "api",
  "reports",
  "sprint",
  "[id]",
  "route.ts",
);
const RISKS_PAGE = readSource("src", "app", "risks", "page.tsx");

describe("monitoring page↔API alignment", () => {
  it("emits every key the monitoring page renders", () => {
    for (const key of [
      "details",
      "capacityPoints",
      "usedPoints",
      "totalTasks",
      "completedTasks",
      "activeTasks",
      "severity",
      "estimatedHours",
    ]) {
      expect(MONITORING_ROUTE, `missing alias ${key}`).toMatch(key);
    }
    // Page consumes the same keys (no undefined cells).
    expect(MONITORING_PAGE).toMatch(/factor\.details/);
    expect(MONITORING_PAGE).toMatch(/completedTasks.*totalTasks/);
    expect(MONITORING_PAGE).toMatch(/risk\.severity/);
  });

  it("shares one health-band definition (80/55) across API and page", () => {
    expect(MONITORING_ROUTE).toMatch(/score >= 80/);
    expect(MONITORING_ROUTE).toMatch(/score >= 55/);
    expect(MONITORING_PAGE).toMatch(/HEALTHY \(80-100\)/);
    expect(MONITORING_PAGE).toMatch(/ATTENTION \(55-79\)/);
    expect(MONITORING_PAGE).toMatch(/score >= 80/);
    expect(MONITORING_PAGE).toMatch(/score >= 55/);
  });

  it("guards invalid dates instead of serializing NaN", () => {
    expect(MONITORING_ROUTE).toMatch(/Number\.isNaN/);
  });
});

describe("report route hardening", () => {
  it.each([
    ["project", PROJECT_REPORT],
    ["sprint", SPRINT_REPORT],
  ])("%s report validates ids and uses the canonical envelope", (_label, src) => {
    expect(src).toMatch(/isUuid/);
    expect(src).toMatch(/validationErrorResponse/);
    expect(src).toMatch(/notFoundResponse/);
    expect(src).toMatch(/internalErrorResponse/);
    // No raw error-message leaks and no non-canonical envelopes.
    expect(src).not.toMatch(/details: error\.message/);
    expect(src).not.toMatch(/NextResponse\.json\(\{ error:/);
  });

  it.each([
    ["project", PROJECT_REPORT],
    ["sprint", SPRINT_REPORT],
  ])("%s report scopes developer-name lookups (no full users scan)", (_label, src) => {
    expect(src).toMatch(/inArray\(users\.id, assigneeIds\)/);
    expect(src).not.toMatch(/db\.select\(\)\.from\(users\)/);
  });
});

describe("risks page normalization", () => {
  it("maps snake_case API rows to the camelCase render shape", () => {
    expect(RISKS_PAGE).toMatch(/normalizeRisk/);
    expect(RISKS_PAGE).toMatch(/row\.project_id/);
    expect(RISKS_PAGE).toMatch(/row\.created_at/);
  });
});
