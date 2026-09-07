import { db } from "../db";
import { sprints } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllSprints() {
  return db
    .select()
    .from(sprints)
    .orderBy(desc(sprints.createdAt));
}