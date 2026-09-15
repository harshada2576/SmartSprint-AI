import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProvisionedServerOnly } from "@/lib/auth/provision-server";

/**
 * Trusted server provisioning lane.
 *
 * `POST /auth/provision` — the ONLY browser-reachable path that may create
 * `public.users` / `organizations` / the first ADMIN `organization_members`
 * row. The browser never receives the service-role key and never writes
 * those rows directly.
 *
 * Identity is derived server-side from the Supabase session (cookie) or,
 * as a race-safe fallback, a `Authorization: Bearer <access_token>` header
 * verified with `auth.getUser(token)`. Client-supplied user ids, roles,
 * organization ids, and ADMIN flags are never read and never trusted.
 */

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function asOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function toSafeCode(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : "";
  if (message === "account_exists") {
    return { status: 409, code: "account_exists" };
  }
  if (message === "oauth_no_email") {
    return { status: 400, code: "oauth_no_email" };
  }
  if (message === "organization_name_required") {
    return { status: 400, code: "organization_name_required" };
  }
  return { status: 500, code: "provisioning_failed" };
}

export async function POST(request: NextRequest) {
  // 1. Verify identity from the server-side session. Never trust client claims.
  const supabase = await createClient();
  let user = (await supabase.auth.getUser()).data.user ?? null;

  if (!user) {
    const token = getBearerToken(request);
    if (token) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        const verifier = createSupabaseClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data } = await verifier.auth.getUser(token);
        user = data.user ?? null;
      }
    }
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, code: "session_expired" },
      { status: 401 }
    );
  }

  // 2. Accept ONLY display fields. Any role / id / membership fields in the
  //    body are deliberately ignored (see note above).
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const payload = (body ?? {}) as Record<string, unknown>;

  const firstName = asOptionalString(payload.firstName, 80);
  const lastName = asOptionalString(payload.lastName, 80);
  const organizationName = asOptionalString(payload.organizationName, 120);

  // 3. Trusted provisioning with the verified Auth identity.
  try {
    const result = await ensureUserProvisionedServerOnly(
      { id: user.id, email: user.email, user_metadata: user.user_metadata },
      { firstName, lastName, organizationName }
    );
    return NextResponse.json({
      ok: true,
      organizationId: result.organizationId,
      createdOrganization: result.createdOrganization,
    });
  } catch (error) {
    const { status, code } = toSafeCode(error);
    // Safe errors only: never surface SQL, keys, or internals.
    return NextResponse.json({ ok: false, code }, { status });
  }
}
