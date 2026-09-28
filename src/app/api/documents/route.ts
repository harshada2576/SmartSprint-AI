import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import { mayAccessDocuments } from "@/services/rbac";
import {
  createdResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
  successResponse,
  validationErrorResponse,
} from "@/api/response";
import { isUuid } from "@/schemas/query-params";
import type { AppRole } from "@/types/api";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const FILE_TYPES = new Set([
  "pdf",
  "doc",
  "image",
  "code",
  "spreadsheet",
  "other",
]);

async function checkDocumentAccess(
  supabase: Parameters<typeof isProjectAccessible>[0],
  scope: { rolesByOrg: Record<string, AppRole> },
  projectId: string,
): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; response: ReturnType<typeof notFoundResponse> }
  | { ok: false; response: ReturnType<typeof forbiddenResponse> }
> {
  if (!(await isProjectAccessible(supabase, projectId))) {
    return { ok: false, response: notFoundResponse("Project not found") };
  }
  const { data, error } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", projectId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const orgId = (data as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return { ok: false, response: notFoundResponse("Project not found") };
  }
  // Matrix (Documents): ADMIN, FINANCE, LEGAL, HR. No PM/DEV.
  if (!mayAccessDocuments(scope.rolesByOrg[orgId])) {
    return { ok: false, response: forbiddenResponse() };
  }
  return { ok: true, organizationId: orgId };
}

/**
 * GET /api/documents?projectId=<uuid>&folderId=<uuid|none>
 * Matrix: ADMIN, FINANCE, LEGAL, HR. PM/DEV denied.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
    if (!isUuid(projectId)) {
      return validationErrorResponse([
        { field: "projectId", message: "projectId must be a valid UUID" },
      ]);
    }
    const gate = await checkDocumentAccess(supabase, scope, projectId);
    if (!gate.ok) return gate.response;

    const folderParam = request.nextUrl.searchParams.get("folderId");
    let query = supabase
      .from("documents")
      .select(
        "id,project_id,folder_id,name,file_type,file_size,storage_path,storage_bucket,owner_id,version,is_latest,description,created_at,updated_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (folderParam && isUuid(folderParam)) {
      query = query.eq("folder_id", folderParam);
    }
    const { data, error } = await query;
    if (error) throw error;

    const { data: folders, error: foldersError } = await supabase
      .from("folders")
      .select("id,project_id,parent_id,name,created_by,created_at")
      .eq("project_id", projectId)
      .limit(200);
    if (foldersError) throw foldersError;

    return successResponse({
      documents: Array.isArray(data) ? data : [],
      folders: Array.isArray(folders) ? folders : [],
    });
  } catch (error) {
    console.error("GET /api/documents failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/documents — create document metadata (upload happens through
 * the signed-URL flow; Storage object policies mirror this gate).
 * Matrix: ADMIN, FINANCE, LEGAL, HR. Delete stays ADMIN-only.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const scope = await resolveRequestScope(supabase, user.id);
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }
    const projectId =
      typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!isUuid(projectId)) {
      return validationErrorResponse([
        { field: "projectId", message: "projectId must be a valid UUID" },
      ]);
    }
    const gate = await checkDocumentAccess(supabase, scope, projectId);
    if (!gate.ok) return gate.response;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return validationErrorResponse([
        { field: "name", message: "name is required" },
      ]);
    }
    const fileType =
      typeof body.fileType === "string" && FILE_TYPES.has(body.fileType)
        ? body.fileType
        : "other";
    const fileSize = Number(body.fileSize);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return validationErrorResponse([
        { field: "fileSize", message: "fileSize must be a positive number" },
      ]);
    }
    const storagePath =
      typeof body.storagePath === "string" ? body.storagePath.trim() : "";
    if (!storagePath) {
      return validationErrorResponse([
        { field: "storagePath", message: "storagePath is required" },
      ]);
    }
    const folderId =
      typeof body.folderId === "string" && isUuid(body.folderId)
        ? body.folderId
        : null;
    if (folderId) {
      const { data: folder, error: folderError } = await supabase
        .from("folders")
        .select("id,project_id")
        .eq("id", folderId)
        .limit(1)
        .maybeSingle();
      if (folderError) throw folderError;
      if (
        !folder ||
        (folder as { project_id?: string }).project_id !== projectId
      ) {
        return validationErrorResponse([
          {
            field: "folderId",
            message: "folderId must reference a folder in the same project",
          },
        ]);
      }
    }

    // Create folder on demand when folderName is supplied without folderId.
    let resolvedFolderId = folderId;
    if (
      !resolvedFolderId &&
      typeof body.folderName === "string" &&
      body.folderName.trim()
    ) {
      const { data: createdFolder, error: folderInsertError } = await supabase
        .from("folders")
        .insert({
          project_id: projectId,
          parent_id: null,
          name: body.folderName.trim().slice(0, 120),
          created_by: user.id,
        })
        .select("id")
        .single();
      if (folderInsertError) {
        if ((folderInsertError as { code?: string }).code === "42501") {
          return forbiddenResponse();
        }
        throw folderInsertError;
      }
      resolvedFolderId = (createdFolder as { id: string }).id;
    }

    const { data: created, error } = await supabase
      .from("documents")
      .insert({
        project_id: projectId,
        folder_id: resolvedFolderId,
        name: name.slice(0, 255),
        file_type: fileType,
        file_size: Math.round(fileSize),
        storage_path: storagePath,
        storage_bucket: "project-documents",
        owner_id: user.id,
        description:
          typeof body.description === "string" ? body.description : null,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    return createdResponse(created);
  } catch (error) {
    console.error("POST /api/documents failed:", error);
    return internalErrorResponse();
  }
}
