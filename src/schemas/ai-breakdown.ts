import { z } from "zod";

export const aiTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  estimatedHours: z.number().nonnegative().default(4),
  acceptanceCriteria: z.array(z.string()).default([]),
});

export const aiEpicSchema = z.object({
  name: z.string().min(1, "Epic name is required"),
  description: z.string().default(""),
  tasks: z.array(aiTaskSchema).min(1, "At least one task is required per epic"),
});

export const aiSuggestedSprintSchema = z.object({
  name: z.string().min(1, "Sprint name is required"),
  goal: z.string().default(""),
  taskIndexes: z.array(z.number().int().nonnegative()),
});

export const aiProjectBreakdownSchema = z.object({
  projectSummary: z.string().min(1, "Project summary is required"),
  epics: z.array(aiEpicSchema).min(1, "At least one epic is required"),
  suggestedSprints: z.array(aiSuggestedSprintSchema).default([]),
});

export type AiProjectBreakdown = z.infer<typeof aiProjectBreakdownSchema>;
