import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { mayAccessDocuments } from "@/services/rbac";
import {
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import { getServiceRoleClient } from "@/lib/auth/service-role-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadDocument(
  supabase: Parameters<typeof isProjectAccessible>[0],
  id: string,
) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as {
    id: string;
    project_id: string;
    storage_path: string;
    storage_bucket: string;
  } | null) ?? null;
}

/**
 * GET /api/documents/[id] — document metadata (matrix: ADMIN, FINANCE,
 * LEGAL, HR; PM/DEV denied).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return validationErrorResponse([
        { field: "id", message: "id must be a valid UUID" },
      ]);
    }
    const scope = await resolveRequestScope(supabase, user.id);
    const doc = await loadDocument(supabase, id);
    if (!doc || !(await isProjectAccessible(supabase, doc.project_id))) {
      return notFoundResponse("Document not found");
    }
    const { data: project } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", doc.project_id)
      .limit(1)
      .maybeSingle();
    const orgId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (
      !orgId ||
      !mayAccessDocuments(scope.rolesByOrg[orgId])
    ) {
      return forbiddenResponse();
    }
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFoundResponse("Document not found");
    return successResponse(data);
  } catch (error) {
    console.error("GET /api/documents/[id] failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/documents/[id] with `{ "action": "signed-url" }` — mint a
 * short-lived download URL. The metadata gate above runs first: users
 * denied metadata access can never obtain the underlying object.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return validationErrorResponse([
        { field: "id", message: "id must be a valid UUID" },
      ]);
    }
    const body = await request.json().catch(() => null);
    if (!isRecord(body) || body.action !== "signed-url") {
      return validationErrorResponse([
        { field: "action", message: 'action must be "signed-url"' },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const doc = await loadDocument(supabase, id);
    if (!doc || !(await isProjectAccessible(supabase, doc.project_id))) {
      return notFoundResponse("Document not found");
    }
    const { data: project } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", doc.project_id)
      .limit(1)
      .maybeSingle();
    const orgId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (
      !orgId ||
      !mayAccessDocuments(scope.rolesByOrg[orgId])
    ) {
      return forbiddenResponse();
    }

    const service = getServiceRoleClient();
    const { data, error } = await service.storage
      .from(doc.storage_bucket || "project-documents")
      .createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      return notFoundResponse("Document object not available");
    }
    return successResponse({ signedUrl: data.signedUrl, expiresIn: 300 });
  } catch (error) {
    console.error("POST /api/documents/[id] failed:", error);
    return internalErrorResponse();
  }
}

/**
 * DELETE /api/documents/[id] — ADMIN only (matrix: Delete = ADMIN).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return validationErrorResponse([
        { field: "id", message: "id must be a valid UUID" },
      ]);
    }
    const scope = await resolveRequestScope(supabase, user.id);
    const doc = await loadDocument(supabase, id);
    if (!doc || !(await isProjectAccessible(supabase, doc.project_id))) {
      return notFoundResponse("Document not found");
    }
    const { data: project } = await supabase
      .from("projects")
      .select("id,organization_id")
      .eq("id", doc.project_id)
      .limit(1)
      .maybeSingle();
    const orgId = (project as { organization_id?: string } | null)
      ?.organization_id;
    if (!orgId || scope.rolesByOrg[orgId] !== "ADMIN") {
      return forbiddenResponse("Only Administrators can delete documents");
    }

    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    // Best-effort object removal (metadata delete is authoritative).
    try {
      const service = getServiceRoleClient();
      await service.storage
        .from(doc.storage_bucket || "project-documents")
        .remove([doc.storage_path]);
    } catch {
      // Object cleanup failures must not fail the metadata delete.
    }
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id] failed:", error);
    return internalErrorResponse();
  }
}
