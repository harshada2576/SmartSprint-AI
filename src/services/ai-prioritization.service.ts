import { spawn } from "node:child_process";
import path from "node:path";

import { getServiceRoleClient } from "@/lib/auth/service-role-server";
import type { SupabaseClient } from "@supabase/supabase-js";

const FEATURES = [
  "category",
  "business_value",
  "customer_importance",
  "urgency",
  "risk",
] as const;

const QUERY_BATCH_SIZE = 200;
const UPDATE_BATCH_SIZE = 25;

/**
 * Maximum time to wait for the Python prediction process before killing
 * it. Without a timeout a hung interpreter hangs the request (and the
 * caller's connection) indefinitely. Overridable for slow hosts via
 * `AI_PREDICT_TIMEOUT_MS`.
 */
const PREDICT_TIMEOUT_MS =
  Number(process.env.AI_PREDICT_TIMEOUT_MS ?? "") > 0
    ? Number(process.env.AI_PREDICT_TIMEOUT_MS)
    : 120_000;

/**
 * Python interpreter used to spawn `predict_priority.py`. Defaults to
 * `python`; override with `AI_PYTHON_BIN` (e.g. `python3`) on hosts
 * where `python` is missing or points at Python 2.
 */
const PYTHON_BIN = process.env.AI_PYTHON_BIN ?? "python";

interface RequirementForPrediction {
  id: string;
  project_id: string;
  display_id: string;
  title: string;
  category: string;
  business_value: string;
  customer_importance: number | null;
  urgency: number | null;
  risk: number | null;
}

interface PredictionItem {
  suggestedPriority: "low" | "medium" | "high";
  confidenceScore?: number;
  probabilities?: {
    low: number;
    medium: number;
    high: number;
  };
}

interface PredictionBatchResult {
  success: boolean;
  predictions?: PredictionItem[];
  error?: string;
}

interface ExistingPrediction {
  id: string;
  requirement_id: string;
  recommendation_status: "pending" | "approved" | "rejected";
  created_at: string;
}


function getPredictionScriptPath(): string {
  return path.join(
    process.cwd(),
    "ai",
    "ml",
    "scripts",
    "predict_priority.py",
  );
}

async function predictPriorities(
  requirements: RequirementForPrediction[],
): Promise<PredictionItem[]> {
  const payload = JSON.stringify(
    requirements.map((requirement) => ({
      category: requirement.category,
      business_value: requirement.business_value,
      customer_importance: requirement.customer_importance,
      urgency: requirement.urgency,
      risk: requirement.risk,
    })),
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (value: PredictionItem[]): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const settleReject = (error: Error): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    };

    const child = spawn(
      PYTHON_BIN,
      [getPredictionScriptPath()],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const timer = setTimeout(() => {
      child.kill();
      settleReject(
        new Error(
          `AI prediction timed out after ${PREDICT_TIMEOUT_MS}ms`,
        ),
      );
    }, PREDICT_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      settleReject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        settleReject(
          new Error(
            stderr.trim() ||
              `Python prediction process exited with code ${code}`,
          ),
        );
        return;
      }

      try {
        const result =
          JSON.parse(stdout.trim()) as PredictionBatchResult;

        if (!result.success || !result.predictions) {
          settleReject(
            new Error(
              result.error ?? "ai_prediction_failed",
            ),
          );
          return;
        }

        if (
          result.predictions.length !==
          requirements.length
        ) {
          settleReject(
            new Error(
              `Prediction count mismatch: expected ${requirements.length}, received ${result.predictions.length}`,
            ),
          );
          return;
        }

        settleResolve(result.predictions);
      } catch (error) {
        settleReject(
          new Error(
            `Invalid prediction response: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          ),
        );
      }
    });

    child.stdin.on("error", (error) => {
      settleReject(error);
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function buildSummary(
  requirement: RequirementForPrediction,
  prediction: PredictionItem,
): string {
  return (
    `XGBoost predicts ${prediction.suggestedPriority} priority ` +
    `for ${requirement.display_id} based on business value, ` +
    `category, customer importance, urgency, and risk.`
  );
}

function buildReasoning(
  requirement: RequirementForPrediction,
  prediction: PredictionItem,
): string[] {
  return [
    `Category: ${requirement.category}`,
    `Business value: ${requirement.business_value}`,
    `Customer importance: ${
      requirement.customer_importance ?? "Not specified"
    }/100`,
    `Urgency: ${
      requirement.urgency ?? "Not specified"
    }/100`,
    `Risk: ${
      requirement.risk ?? "Not specified"
    }/100`,
    `XGBoost confidence: ${
      prediction.confidenceScore?.toFixed(2) ?? "N/A"
    }%`,
  ];
}

/**
 * Per-row input guard: one malformed requirement must not poison the
 * whole Python batch (the script fails closed on the first bad row).
 * Loose by design — only shape is checked, never business semantics —
 * so legacy categories or label-adjacent values still reach the model.
 */
export function isRowPredictable(
  requirement: RequirementForPrediction,
): boolean {  if (
    typeof requirement.category !== "string" ||
    requirement.category.trim() === ""
  ) {
    return false;
  }
  if (
    typeof requirement.business_value !== "string" ||
    requirement.business_value.trim() === ""
  ) {
    return false;
  }
  for (const numeric of [
    requirement.customer_importance,
    requirement.urgency,
    requirement.risk,
  ]) {
    if (
      numeric !== null &&
      (typeof numeric !== "number" ||
        !Number.isFinite(numeric))
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Per-row output guard: drops model outputs outside the serving
 * contract (unknown label, confidence outside 0–100) instead of
 * persisting them or failing the batch.
 */
export function isValidPredictionItem(
  prediction: unknown,
): prediction is PredictionItem {
  if (typeof prediction !== "object" || prediction === null) {
    return false;
  }
  const item = prediction as Partial<PredictionItem>;
  if (
    item.suggestedPriority !== "low" &&
    item.suggestedPriority !== "medium" &&
    item.suggestedPriority !== "high"
  ) {
    return false;
  }
  if (
    item.confidenceScore !== undefined &&
    (typeof item.confidenceScore !== "number" ||
      !Number.isFinite(item.confidenceScore) ||
      item.confidenceScore < 0 ||
      item.confidenceScore > 100)
  ) {
    return false;
  }
  return true;
}

async function getExistingPredictions(  serviceSupabase: SupabaseClient,
  requirementIds: string[],
): Promise<ExistingPrediction[]> {
  const results: ExistingPrediction[] = [];

  for (
    let start = 0;
    start < requirementIds.length;
    start += QUERY_BATCH_SIZE
  ) {
    const ids = requirementIds.slice(
      start,
      start + QUERY_BATCH_SIZE,
    );

    const { data, error } = await serviceSupabase
      .from("ai_predictions")
      .select(
        "id,requirement_id,recommendation_status,created_at",
      )
      .in("requirement_id", ids)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    results.push(
      ...((data ?? []) as ExistingPrediction[]),
    );
  }

  return results;
}

function buildPredictionRow(
  requirement: RequirementForPrediction,
  prediction: PredictionItem,
) {
  return {
    requirement_id: requirement.id,
    suggested_priority: prediction.suggestedPriority,
    suggested_sprint_id: null,
    confidence_score:
      prediction.confidenceScore ?? null,
    summary: buildSummary(
      requirement,
      prediction,
    ),
    reasoning: buildReasoning(
      requirement,
      prediction,
    ),
    recommendation_status: "pending",
  };
}

/**
 * Overwrites a still-pending prediction with a fresh model output.
 *
 * The `.eq("recommendation_status", "pending")` guard is the TOCTOU fix:
 * a PM/ADMIN approval landing between the `getExistingPredictions` read
 * and this write must not be reverted to `pending` (which would also
 * leave stale `approved_by/at` values behind). A zero-row update means
 * the row was decided concurrently and counts as skipped, not failed.
 */
async function updatePendingPrediction(
  serviceSupabase: SupabaseClient,
  predictionId: string,
  requirement: RequirementForPrediction,
  prediction: PredictionItem,
): Promise<"updated" | "stale" | "error"> {
  const { data, error } = await serviceSupabase
    .from("ai_predictions")
    .update({
      suggested_priority:
        prediction.suggestedPriority,
      suggested_sprint_id: null,
      confidence_score:
        prediction.confidenceScore ?? null,
      summary: buildSummary(
        requirement,
        prediction,
      ),
      reasoning: buildReasoning(
        requirement,
        prediction,
      ),
      recommendation_status: "pending",
    })
    .eq("id", predictionId)
    .eq("recommendation_status", "pending")
    .select("id");

  if (error) {
    console.error(
      `AI prediction update failed for ${requirement.id}:`,
      error,
    );
    return "error";
  }

  if (!data || data.length === 0) {
    return "stale";
  }

  return "updated";
}

async function savePredictions(
  serviceSupabase: SupabaseClient,
  requirements: RequirementForPrediction[],
  predictions: PredictionItem[],
): Promise<{
  analyzed: number;
  failed: number;
}> {
  const existingPredictions =
    await getExistingPredictions(
      serviceSupabase,
      requirements.map(
        (requirement) => requirement.id,
      ),
    );

  const latestByRequirement =
    new Map<string, ExistingPrediction>();

  for (const existing of existingPredictions) {
    if (
      !latestByRequirement.has(
        existing.requirement_id,
      )
    ) {
      latestByRequirement.set(
        existing.requirement_id,
        existing,
      );
    }
  }

  const updates: Array<{
    requirement: RequirementForPrediction;
    prediction: PredictionItem;
    predictionId: string;
  }> = [];

  const inserts: Array<{
    requirement: RequirementForPrediction;
    prediction: PredictionItem;
  }> = [];

  let skipped = 0;

  for (
    let index = 0;
    index < requirements.length;
    index += 1
  ) {
    const requirement = requirements[index];
    const prediction = predictions[index];

    if (!prediction) {
      continue;
    }

    const existing =
      latestByRequirement.get(
        requirement.id,
      );

    if (
      existing?.recommendation_status ===
        "approved" ||
      existing?.recommendation_status ===
        "rejected"
    ) {
      skipped += 1;
      continue;
    }

    if (
      existing?.recommendation_status ===
      "pending"
    ) {
      updates.push({
        requirement,
        prediction,
        predictionId: existing.id,
      });
    } else {
      inserts.push({
        requirement,
        prediction,
      });
    }
  }

  let analyzed = skipped;
  let failed = 0;

  for (
    let start = 0;
    start < updates.length;
    start += UPDATE_BATCH_SIZE
  ) {
    const batch = updates.slice(
      start,
      start + UPDATE_BATCH_SIZE,
    );

    const results = await Promise.all(
      batch.map(async (item) => {
        return updatePendingPrediction(
          serviceSupabase,
          item.predictionId,
          item.requirement,
          item.prediction,
        );
      }),
    );

    analyzed += results.filter(
      (outcome) => outcome !== "error",
    ).length;
    failed += results.filter(
      (outcome) => outcome === "error",
    ).length;
  }

  if (inserts.length > 0) {
    const rows = inserts.map(
      ({ requirement, prediction }) =>
        buildPredictionRow(
          requirement,
          prediction,
        ),
    );

    for (
      let start = 0;
      start < rows.length;
      start += QUERY_BATCH_SIZE
    ) {
      const batch = rows.slice(
        start,
        start + QUERY_BATCH_SIZE,
      );

      const { error } = await serviceSupabase
        .from("ai_predictions")
        .insert(batch);

      if (error) {
        console.error(
          "AI prediction bulk insert failed:",
          error,
        );

        failed += batch.length;
      } else {
        analyzed += batch.length;
      }
    }
  }

  return {
    analyzed,
    failed,
  };
}

export interface RunAiPrioritizationOptions {
  projectId?: string;
}

export type AiPrioritizationStatus =
  | "empty"
  | "complete"
  | "partial"
  | "unavailable";

export interface RunAiPrioritizationResult {
  analyzed: number;
  failed: number;
  /**
   * Machine-readable outcome (additive; the `{ analyzed, failed }`
   * contract is unchanged):
   * - `empty`: no requirements in scope.
   * - `complete`: every in-scope requirement analyzed.
   * - `partial`: some rows analyzed, some failed.
   * - `unavailable`: nothing analyzed (model down, or every row
   *   failed input/output validation).
   */
  status: AiPrioritizationStatus;
}

export async function runAiPrioritization(
  callerSupabase: SupabaseClient,
  options: RunAiPrioritizationOptions = {},
): Promise<RunAiPrioritizationResult> {
  let query = callerSupabase
    .from("requirements")
    .select(
      [
        "id",
        "project_id",
        "display_id",
        "title",
        ...FEATURES,
      ].join(","),
    )
    .order("created_at", {
      ascending: false,
    });

  if (options.projectId) {
    query = query.eq(
      "project_id",
      options.projectId,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const requirements =
    (data ?? []) as unknown as RequirementForPrediction[];

  if (requirements.length === 0) {
    return {
      analyzed: 0,
      failed: 0,
      status: "empty",
    };
  }

  const serviceSupabase =
    getServiceRoleClient();

  const predictable = requirements.filter((requirement) => {
    if (isRowPredictable(requirement)) {
      return true;
    }
    console.error(
      `AI prioritization input rejected for ${requirement.id}: malformed feature row`,
    );
    return false;
  });

  const rejectedRows = requirements.length - predictable.length;

  if (predictable.length === 0) {
    return {
      analyzed: 0,
      failed: rejectedRows,
      status: "unavailable",
    };
  }

  try {
    const rawPredictions =
      await predictPriorities(predictable);

    const validPairs = predictable
      .map((requirement, index) => ({
        requirement,
        prediction: rawPredictions[index],
      }))
      .filter((pair) => {
        if (
          pair.prediction !== undefined &&
          isValidPredictionItem(pair.prediction)
        ) {
          return true;
        }
        console.error(
          `AI prioritization output rejected for ${pair.requirement.id}: contract violation`,
        );
        return false;
      });

    const rejectedOutputs =
      predictable.length - validPairs.length;

    const saved = await savePredictions(
      serviceSupabase,
      validPairs.map((pair) => pair.requirement),
      validPairs.map(
        (pair) => pair.prediction as PredictionItem,
      ),
    );

    const analyzed = saved.analyzed;
    const failed =
      saved.failed + rejectedRows + rejectedOutputs;

    return {
      analyzed,
      failed,
      status:
        analyzed === 0
          ? "unavailable"
          : failed === 0
            ? "complete"
            : "partial",
    };
  } catch (error) {
    console.error(
      "AI prioritization failed:",
      error,
    );

    return {
      analyzed: 0,
      failed: requirements.length,
      status: "unavailable",
    };
  }
}