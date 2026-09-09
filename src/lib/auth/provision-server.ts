import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  namesFromMetadata,
  organizationNameFromMetadata,
  slugifyOrganizationName,
} from "./organization";

/**
 * Trusted server-only provisioning lane.
 *
 * SECURITY BOUNDARY — READ CAREFULLY:
 * - This module uses `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix).
 *   It must ONLY ever be imported by server code (`src/app/auth/**` route
 *   handlers). It must NEVER be imported by a `"use client"` component or
 *   any module reachable from browser JavaScript.
 * - RLS intentionally denies organization bootstrap for normal callers (no
 *   INSERT policy on `organizations`; `organization_members` INSERT requires
 *   existing ADMIN). This lane bypasses RLS with the service role precisely
 *   because it re-validates identity server-side and hardcodes ADMIN.
 * - The authenticated identity (`id`, `email`, metadata) must come from
 *   Supabase Auth server-side (`auth.getUser()` after cookie/bearer
 *   verification). Callers must never accept client-supplied user ids,
 *   roles, organization ids, or ADMIN flags.
 */

const ORG_CREATOR_ROLE = "ADMIN" as const;
const MAX_SLUG_ATTEMPTS = 10;
const MAX_ORG_NAME_LENGTH = 120;
const MAX_NAME_LENGTH = 80;

export interface VerifiedProvisioningIdentity {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

export interface ProvisionOverrides {
  firstName?: string;
  lastName?: string;
  organizationName?: string;
}

export interface ProvisionResult {
  organizationId: string;
  createdOrganization: boolean;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "provision-server is server-only and must never run in the browser."
    );
  }
}

function getServiceRoleClient(): SupabaseClient {
  assertServerOnly();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Server-only secret: no NEXT_PUBLIC_ prefix, never sent to the browser,
  // never logged, never returned.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("provisioning_failed");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
}

function sanitizeName(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
}

async function findUniqueSlug(
  supabase: SupabaseClient,
  base: string
): Promise<string> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt}`;
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      return candidate;
    }
  }
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/**
 * Idempotent trusted provisioning for a server-verified Auth identity.
 *
 * - Creates `public.users` (id = auth user id) when missing; updates display
 *   fields for the owning identity only.
 * - Creates exactly one organization + one hardcoded ADMIN membership only
 *   when the user has zero memberships. Existing members are returned
 *   untouched (no role changes, no extra organizations).
 * - Fails closed when the email already belongs to a different profile id
 *   (e.g. seeded rows with unrelated UUIDs): throws `account_exists` and
 *   never merges or re-owns rows.
 *
 * Safe to retry: repeated calls for the same identity return the existing
 * membership without creating duplicates (best-effort; see docs for the
 * concurrent double-POST limitation).
 */
export async function ensureUserProvisionedServerOnly(
  verifiedUser: VerifiedProvisioningIdentity,
  overrides?: ProvisionOverrides
): Promise<ProvisionResult> {
  assertServerOnly();

  const userId = verifiedUser.id;
  const email = verifiedUser.email ?? null;
  if (!userId || !email) {
    throw new Error("oauth_no_email");
  }

  const metadata = (verifiedUser.user_metadata ?? {}) as Record<string, unknown>;
  const derived = namesFromMetadata(metadata, email);
  const firstName = sanitizeName(overrides?.firstName ?? derived.firstName, "User");
  const lastName = sanitizeName(overrides?.lastName ?? derived.lastName, "");
  const organizationName = (
    overrides?.organizationName ?? organizationNameFromMetadata(metadata, email)
  )
    .trim()
    .slice(0, MAX_ORG_NAME_LENGTH);

  if (!organizationName) {
    throw new Error("organization_name_required");
  }

  const supabase = getServiceRoleClient();

  // 1. Fail closed if this email already belongs to a different profile
  //    (e.g. a seeded user not linked to this auth identity). Never merge.
  const { data: existingByEmail, error: emailLookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (emailLookupError) {
    throw emailLookupError;
  }
  if (existingByEmail && existingByEmail.id !== userId) {
    throw new Error("account_exists");
  }

  // 2. Upsert the application profile keyed by the verified auth user id.
  const { error: profileError } = await supabase.from("users").upsert(
    {
      id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      avatar_initials: initials(firstName, lastName),
      status: "active",
    },
    { onConflict: "id" }
  );
  if (profileError) {
    throw profileError;
  }

  // 3. Idempotency gate: existing members never get a new organization.
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1);
  if (membershipError) {
    throw membershipError;
  }
  if (memberships && memberships.length > 0) {
    return {
      organizationId: memberships[0].organization_id as string,
      createdOrganization: false,
    };
  }

  // 4. Create the organization with a collision-safe slug.
  const slug = await findUniqueSlug(
    supabase,
    slugifyOrganizationName(organizationName)
  );
  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: organizationName, slug })
    .select("id")
    .single();
  if (orgError || !organization) {
    throw orgError ?? new Error("provisioning_failed");
  }

  // 5. Grant the creator ADMIN (hardcoded; no caller-supplied role exists).
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: organization.id,
      user_id: userId,
      role: ORG_CREATOR_ROLE,
    });
  if (memberError) {
    // Best-effort cleanup so a retry does not orphan an admin-less org.
    await supabase.from("organizations").delete().eq("id", organization.id);
    throw memberError;
  }

  return { organizationId: organization.id, createdOrganization: true };
}
