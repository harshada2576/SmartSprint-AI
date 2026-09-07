import { db } from "../db";
import { projects } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllProjects() {
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));
}