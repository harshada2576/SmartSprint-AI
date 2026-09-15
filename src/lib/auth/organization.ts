/**
 * Client-safe auth helpers: pure derivation + trusted-provisioning request.
 *
 * SECURITY BOUNDARY:
 * - This module is importable by browser components. It must NEVER perform
 *   privileged database writes (organizations / organization_members) and
 *   must NEVER import the service-role key or server-only helpers.
 * - The actual provisioning (public.users -> organizations ->
 *   organization_members with hardcoded ADMIN) happens server-side in
 *   `src/lib/auth/provision-server.ts` via `POST /auth/provision` or
 *   `GET /auth/callback`. This module only *requests* that trusted path.
 * - The organization-creator role (ADMIN) is hardcoded server-side. There is
 *   intentionally no role parameter anywhere in this module.
 */

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

export interface ProvisionRequestOverrides {
  firstName?: string;
  lastName?: string;
  organizationName?: string;
}

export interface ProvisionSuccess {
  organizationId: string;
  createdOrganization: boolean;
}

/**
 * Client-safe provisioning request. Calls the trusted server lane
 * (`POST /auth/provision`), which derives the authenticated user from the
 * Supabase session/token server-side and performs the privileged writes
 * with the service-role key (never exposed to the browser).
 *
 * Never sends user ids, roles, or membership claims: the server ignores any
 * such fields and uses only the verified Auth identity plus the display
 * fields below. Throws `Error(code)` where code is one of the safe,
 * machine-readable strings: `account_exists`, `oauth_no_email`,
 * `session_expired`, `provisioning_failed`.
 */
export async function requestProvisioning(
  overrides?: ProvisionRequestOverrides,
  opts?: { accessToken?: string }
): Promise<ProvisionSuccess> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts?.accessToken) {
    headers.Authorization = `Bearer ${opts.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch("/auth/provision", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({
        firstName: overrides?.firstName,
        lastName: overrides?.lastName,
        organizationName: overrides?.organizationName,
      }),
    });
  } catch {
    throw new Error("provisioning_failed");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("provisioning_failed");
  }

  const body = (payload ?? {}) as {
    ok?: boolean;
    code?: string;
    organizationId?: string;
    createdOrganization?: boolean;
  };

  if (response.ok && body.ok && typeof body.organizationId === "string") {
    return {
      organizationId: body.organizationId,
      createdOrganization: body.createdOrganization === true,
    };
  }

  const code =
    typeof body.code === "string" && body.code
      ? body.code
      : response.status === 401
        ? "session_expired"
        : response.status === 409
          ? "account_exists"
          : "provisioning_failed";
  throw new Error(code);
}
