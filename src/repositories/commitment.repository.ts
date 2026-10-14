import type { SupabaseClient } from "@supabase/supabase-js";

export type Commitment = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  commitment_type: "outcome" | "deliverable" | "milestone" | "obligation";
  status: "planned" | "inProgress" | "completed" | "blocked";
  due_date: string | null;
  progress: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCommitmentInput = {
  project_id: string;
  title: string;
  description?: string | null;
  commitment_type?: Commitment["commitment_type"];
  status?: Commitment["status"];
  due_date?: string | null;
  progress?: number;
  owner_id?: string | null;
};

export type UpdateCommitmentInput = Partial<
  Omit<CreateCommitmentInput, "project_id">
>;

export async function listCommitments(
  client: SupabaseClient,
  projectId: string,
): Promise<Commitment[]> {
  const { data, error } = await client
    .from("commitments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Commitment[];
}

export async function getCommitmentById(
  client: SupabaseClient,
  commitmentId: string,
): Promise<Commitment | null> {
  const { data, error } = await client
    .from("commitments")
    .select("*")
    .eq("id", commitmentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Commitment | null;
}

export async function createCommitment(
  client: SupabaseClient,
  input: CreateCommitmentInput,
): Promise<Commitment> {
  const { data, error } = await client
    .from("commitments")
    .insert({
      project_id: input.project_id,
      title: input.title,
      description: input.description ?? null,
      commitment_type: input.commitment_type ?? "deliverable",
      status: input.status ?? "planned",
      due_date: input.due_date ?? null,
      progress: input.progress ?? 0,
      owner_id: input.owner_id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Commitment;
}

export async function updateCommitment(
  client: SupabaseClient,
  commitmentId: string,
  input: UpdateCommitmentInput,
): Promise<Commitment> {
  const { data, error } = await client
    .from("commitments")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Commitment;
}

export async function deleteCommitment(
  client: SupabaseClient,
  commitmentId: string,
): Promise<void> {
  const { error } = await client
    .from("commitments")
    .delete()
    .eq("id", commitmentId);

  if (error) {
    throw error;
  }
}