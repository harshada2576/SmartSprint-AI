import { db } from "../db";
import { notifications } from "../../supabase/schema";
import { desc } from "drizzle-orm";

export async function getAllNotifications() {
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt));
}