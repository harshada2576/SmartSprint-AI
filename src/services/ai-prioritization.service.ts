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
    const child = spawn(
      "python",
      [getPredictionScriptPath()],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
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
          reject(
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
          reject(
            new Error(
              `Prediction count mismatch: expected ${requirements.length}, received ${result.predictions.length}`,
            ),
          );
          return;
        }

        resolve(result.predictions);
      } catch (error) {
        reject(
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
      reject(error);
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

async function getExistingPredictions(
  serviceSupabase: SupabaseClient,
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

async function updatePendingPrediction(
  serviceSupabase: SupabaseClient,
  predictionId: string,
  requirement: RequirementForPrediction,
  prediction: PredictionItem,
): Promise<void> {
  const { error } = await serviceSupabase
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
    .eq("id", predictionId);

  if (error) {
    throw error;
  }
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
        try {
          await updatePendingPrediction(
            serviceSupabase,
            item.predictionId,
            item.requirement,
            item.prediction,
          );

          return true;
        } catch (error) {
          console.error(
            `AI prediction update failed for ${item.requirement.id}:`,
            error,
          );

          return false;
        }
      }),
    );

    analyzed += results.filter(Boolean).length;
    failed += results.filter(
      (success) => !success,
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

export interface RunAiPrioritizationResult {
  analyzed: number;
  failed: number;
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
    };
  }

  const serviceSupabase =
    getServiceRoleClient();

  try {
    const predictions =
      await predictPriorities(requirements);

    return await savePredictions(
      serviceSupabase,
      requirements,
      predictions,
    );
  } catch (error) {
    console.error(
      "AI prioritization failed:",
      error,
    );

    return {
      analyzed: 0,
      failed: requirements.length,
    };
  }
}