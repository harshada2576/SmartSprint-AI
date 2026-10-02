import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCommitment,
  deleteCommitment,
  getCommitmentById,
  listCommitments,
  updateCommitment,
  type CreateCommitmentInput,
  type UpdateCommitmentInput,
} from "@/repositories/commitment.repository";

export async function getProjectCommitments(
  client: SupabaseClient,
  projectId: string,
) {
  return listCommitments(client, projectId);
}

export async function getCommitment(
  client: SupabaseClient,
  commitmentId: string,
) {
  return getCommitmentById(client, commitmentId);
}

export async function addCommitment(
  client: SupabaseClient,
  input: CreateCommitmentInput,
) {
  if (!input.title.trim()) {
    throw new Error("Commitment title is required");
  }

  return createCommitment(client, {
    ...input,
    title: input.title.trim(),
  });
}

export async function editCommitment(
  client: SupabaseClient,
  commitmentId: string,
  input: UpdateCommitmentInput,
) {
  if (input.title !== undefined && !input.title.trim()) {
    throw new Error("Commitment title cannot be empty");
  }

  return updateCommitment(client, commitmentId, {
    ...input,
    ...(input.title !== undefined
      ? { title: input.title.trim() }
      : {}),
  });
}

export async function removeCommitment(
  client: SupabaseClient,
  commitmentId: string,
) {
  await deleteCommitment(client, commitmentId);
}