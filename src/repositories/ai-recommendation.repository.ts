import { db } from "../db";
import { aiPredictions } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllAIRecommendations() {
  return db
    .select()
    .from(aiPredictions)
    .orderBy(desc(aiPredictions.createdAt));
}