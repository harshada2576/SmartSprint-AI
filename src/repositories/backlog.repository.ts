import { db } from "../db";
import { backlog } from "../../supabase/schema";

export async function getAllBacklogItems() {
  return db.select().from(backlog);
}