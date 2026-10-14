/**
 * AI prioritization hardening contract tests (DB-free).
 *
 * Covers the per-row input/output guards in
 * `src/services/ai-prioritization.service.ts` plus static scans proving:
 * - pending predictions are only ever overwritten while still pending
 *   (TOCTOU guard against clobbering concurrent approvals),
 * - the Python child process has a kill timeout and a configurable
 *   interpreter,
 * - total model failure is machine-readable (`status: "unavailable"`)
 *   instead of an opaque 200 body.
 *
 * No database, no Python required. Live model behavior remains covered
 * by `tests/ai/*` evaluation harnesses.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isRowPredictable,
  isValidPredictionItem,
} from "../../src/services/ai-prioritization.service";

// The service's persistence lane needs the server-only Supabase client,
// which vite-node cannot resolve transitively here. The guards under
// test are pure; the import is stubbed exactly like repository mocks in
// the neighboring API contract suites.
vi.mock("../../src/lib/auth/service-role-server", () => ({
  getServiceRoleClient: vi.fn(),
}));

const SERVICE_PATH = path.join(
  process.cwd(),
  "src",
  "services",
  "ai-prioritization.service.ts",
);

const VALID_ROW = {
  id: "r1",
  project_id: "p1",
  display_id: "REQ-1",
  title: "T",
  category: "feature",
  business_value: "high",
  customer_importance: 80,
  urgency: 60,
  risk: 20,
};

describe("prediction input isolation", () => {
  it("accepts well-formed rows, including null numerics", () => {
    expect(isRowPredictable(VALID_ROW)).toBe(true);
    expect(
      isRowPredictable({
        ...VALID_ROW,
        customer_importance: null,
        urgency: null,
        risk: null,
      }),
    ).toBe(true);
  });

  it("rejects rows that would poison the Python batch", () => {
    expect(
      isRowPredictable({ ...VALID_ROW, category: "" }),
    ).toBe(false);
    expect(
      isRowPredictable({ ...VALID_ROW, business_value: "" }),
    ).toBe(false);
    expect(
      isRowPredictable({
        ...VALID_ROW,
        customer_importance: Number.NaN,
      }),
    ).toBe(false);
    expect(
      isRowPredictable({
        ...VALID_ROW,
        urgency: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
    expect(
      isRowPredictable({
        ...VALID_ROW,
        risk: "high" as unknown as number,
      }),
    ).toBe(false);
  });
});

describe("prediction output validation", () => {
  it("accepts in-contract model outputs", () => {
    expect(
      isValidPredictionItem({
        suggestedPriority: "high",
        confidenceScore: 87.5,
      }),
    ).toBe(true);
    expect(
      isValidPredictionItem({ suggestedPriority: "low" }),
    ).toBe(true);
  });

  it("rejects outputs outside the serving contract", () => {
    expect(
      isValidPredictionItem({ suggestedPriority: "critical" }),
    ).toBe(false);
    expect(
      isValidPredictionItem({
        suggestedPriority: "high",
        confidenceScore: 101,
      }),
    ).toBe(false);
    expect(
      isValidPredictionItem({
        suggestedPriority: "high",
        confidenceScore: Number.NaN,
      }),
    ).toBe(false);
    expect(isValidPredictionItem(null)).toBe(false);
    expect(isValidPredictionItem("high")).toBe(false);
  });
});

describe("ai-prioritization safety properties (static scan)", () => {
  it("updates only still-pending predictions (TOCTOU guard)", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf8");
    expect(src).toMatch(
      /\.eq\("recommendation_status", "pending"\)/,
    );
    expect(src).toMatch(/"stale"/);
  });

  it("bounds the Python child with a kill timeout and honors AI_PYTHON_BIN", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf8");
    expect(src).toMatch(/PREDICT_TIMEOUT_MS/);
    expect(src).toMatch(/child\.kill\(\)/);
    expect(src).toMatch(/AI_PYTHON_BIN/);
    expect(src).toMatch(/AI_PREDICT_TIMEOUT_MS/);
  });

  it("reports total failure as status unavailable (additive result field)", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf8");
    expect(src).toMatch(/"unavailable"/);
    expect(src).toMatch(/"complete"/);
    expect(src).toMatch(/"partial"/);
    expect(src).toMatch(/"empty"/);
  });
});
