import { db } from "../db";
import { tasks } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllTasks() {
  return db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.createdAt));
}