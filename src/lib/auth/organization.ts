import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Application provisioning: auth.users -> public.users -> organizations
 * -> organization_members.
 *
 * SECURITY RULES (enforced here, not by caller input):
 * - The organization-creator role is hardcoded to ADMIN. Callers can never
 *   pass a role; there is no role parameter on any function in this module.
 * - public.users.id is always the Supabase Auth user id. Passwords are never
 *   handled here (Supabase Auth owns credentials; nothing is stored in
 *   public.users).
 * - Existing application rows (e.g. seeded users) are never overwritten or
 *   re-owned: if the email already belongs to a different profile id, we
 *   fail closed instead of merging.
 */

// Only these roles exist in the application. New organization creators
// always receive ADMIN (they own the organization they just created).
// Plain invite-based signups default to DEVELOPER via the DB default.
const ORG_CREATOR_ROLE = "ADMIN" as const;

const MAX_SLUG_ATTEMPTS = 10;

export function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "workspace";
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
}

function splitFullName(fullName: string | undefined, fallbackEmail: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    const prefix = fallbackEmail.split("@")[0] ?? "User";
    return { firstName: prefix, lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function namesFromMetadata(
  metadata: Record<string, unknown> | undefined,
  email: string
): { firstName: string; lastName: string } {
  const meta = metadata ?? {};
  const firstName =
    (meta.first_name as string | undefined) ??
    (meta.given_name as string | undefined) ??
    "";
  const lastName =
    (meta.last_name as string | undefined) ??
    (meta.family_name as string | undefined) ??
    "";
  if (firstName || lastName) {
    return {
      firstName: firstName || email.split("@")[0] || "User",
      lastName,
    };
  }
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined);
  return splitFullName(fullName, email);
}

export function organizationNameFromMetadata(
  metadata: Record<string, unknown> | undefined,
  email: string
): string {
  const meta = metadata ?? {};
  const fromMeta =
    (meta.organization_name as string | undefined) ??
    (meta.organization as string | undefined);
  if (fromMeta && fromMeta.trim()) {
    return fromMeta.trim();
  }
  const { firstName } = namesFromMetadata(metadata, email);
  return `${firstName}'s Workspace`;
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
  // Extremely unlikely: fall back to a random suffix to guarantee uniqueness.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export interface ProvisionResult {
  organizationId: string;
  createdOrganization: boolean;
}

/**
 * Ensures the application profile + organization membership exist for an
 * authenticated user. Safe to call on every sign-in (idempotent):
 * - Creates public.users if missing (id = auth user id).
 * - Creates an organization + ADMIN membership only if the user has no
 *   organization membership yet.
 * - Never changes roles of existing memberships and never reassigns rows
 *   belonging to another profile id.
 */
export async function ensureUserProvisioned(
  supabase: SupabaseClient,
  authUser: User,
  overrides?: { firstName?: string; lastName?: string; organizationName?: string }
): Promise<ProvisionResult> {
  const email = authUser.email;
  if (!email) {
    throw new Error("oauth_no_email");
  }

  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const derived = namesFromMetadata(metadata, email);
  const firstName = (overrides?.firstName ?? derived.firstName).trim() || "User";
  const lastName = (overrides?.lastName ?? derived.lastName).trim();
  const organizationName = (
    overrides?.organizationName ?? organizationNameFromMetadata(metadata, email)
  ).trim();

  if (!organizationName) {
    throw new Error("Organization name is required.");
  }

  // 1. Fail closed if this email already belongs to a different profile
  //    (e.g. a seeded user not linked to this auth identity).
  const { data: existingByEmail, error: emailLookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (emailLookupError) {
    throw emailLookupError;
  }
  if (existingByEmail && existingByEmail.id !== authUser.id) {
    throw new Error("account_exists");
  }

  // 2. Upsert the application profile keyed by the auth user id.
  const { error: profileError } = await supabase.from("users").upsert(
    {
      id: authUser.id,
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

  // 3. If the user already belongs to an organization, provisioning is done.
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authUser.id)
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
    throw orgError ?? new Error("Failed to create organization.");
  }

  // 5. Grant the creator ADMIN on their own organization (hardcoded role).
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: organization.id,
      user_id: authUser.id,
      role: ORG_CREATOR_ROLE,
    });
  if (memberError) {
    // Best-effort cleanup so we don't orphan an admin-less organization.
    await supabase.from("organizations").delete().eq("id", organization.id);
    throw memberError;
  }

  return { organizationId: organization.id, createdOrganization: true };
}
