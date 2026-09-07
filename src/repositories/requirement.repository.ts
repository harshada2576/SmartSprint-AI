import { db } from "../db";
import { requirements } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllRequirements() {
  return db
    .select()
    .from(requirements)
    .orderBy(desc(requirements.createdAt));
}