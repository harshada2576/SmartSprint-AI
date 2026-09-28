import type { NextRequest } from "next/server";
import {
  getAuthenticatedContext,
  resolveRequestScope,
} from "@/api/auth";
import { isProjectAccessible } from "@/api/access";
import {
  createdResponse,
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

async function taskProjectId(
  supabase: Parameters<typeof isProjectAccessible>[0],
  taskId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,project_id")
    .eq("id", taskId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const projectId = (data as { project_id?: string } | null)?.project_id;
  return typeof projectId === "string" ? projectId : null;
}

/**
 * GET /api/tasks/[id]/attachments — list attachments.
 * RLS mirrors task/project access (staff + project members; HR denied
 * through the project probe).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([
        { field: "id", message: "Task id must be a valid UUID" },
      ]);
    }
    const projectId = await taskProjectId(supabase, taskId);
    if (!projectId || !(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Task not found");
    }
    const { data, error } = await supabase
      .from("task_attachments")
      .select(
        "id,task_id,file_name,storage_path,storage_bucket,file_size,mime_type,uploaded_by,created_at",
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return successResponse(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("GET /api/tasks/[id]/attachments failed:", error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/tasks/[id]/attachments — register an uploaded attachment.
 * Matrix (Upload attachment): ADMIN, PM, DEV, FINANCE, LEGAL with task
 * visibility. HR denied.
 *
 * Body: `{ "fileName", "storagePath", "fileSize", "mimeType"? }` or
 * `{ "action": "signed-url", "attachmentId" }` to mint a download URL.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getAuthenticatedContext(request);
    if ("response" in auth) return auth.response;
    const { user, supabase } = auth.context;

    const { id: taskId } = await context.params;
    if (!isUuid(taskId)) {
      return validationErrorResponse([
        { field: "id", message: "Task id must be a valid UUID" },
      ]);
    }
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return validationErrorResponse([
        { field: "body", message: "Request body must be a JSON object" },
      ]);
    }

    const scope = await resolveRequestScope(supabase, user.id);
    const projectId = await taskProjectId(supabase, taskId);
    if (!projectId || !(await isProjectAccessible(supabase, projectId))) {
      return notFoundResponse("Task not found");
    }

    // Signed-URL minting: metadata gate first (denied metadata -> no URL).
    if (body.action === "signed-url") {
      const attachmentId =
        typeof body.attachmentId === "string" ? body.attachmentId : "";
      if (!isUuid(attachmentId)) {
        return validationErrorResponse([
          {
            field: "attachmentId",
            message: "attachmentId must be a valid UUID",
          },
        ]);
      }
      const { data: attachment, error: loadError } = await supabase
        .from("task_attachments")
        .select("id,storage_path,storage_bucket")
        .eq("id", attachmentId)
        .eq("task_id", taskId)
        .limit(1)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!attachment) return notFoundResponse("Attachment not found");
      const row = attachment as {
        storage_path: string;
        storage_bucket: string;
      };
      const service = getServiceRoleClient();
      const { data, error } = await service.storage
        .from(row.storage_bucket || "task-attachments")
        .createSignedUrl(row.storage_path, 300);
      if (error || !data?.signedUrl) {
        return notFoundResponse("Attachment object not available");
      }
      return successResponse({ signedUrl: data.signedUrl, expiresIn: 300 });
    }

    const fileName =
      typeof body.fileName === "string" ? body.fileName.trim() : "";
    const storagePath =
      typeof body.storagePath === "string" ? body.storagePath.trim() : "";
    const fileSize = Number(body.fileSize);
    if (!fileName) {
      return validationErrorResponse([
        { field: "fileName", message: "fileName is required" },
      ]);
    }
    if (!storagePath) {
      return validationErrorResponse([
        { field: "storagePath", message: "storagePath is required" },
      ]);
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return validationErrorResponse([
        { field: "fileSize", message: "fileSize must be a positive number" },
      ]);
    }
    void scope;

    const { data: created, error } = await supabase
      .from("task_attachments")
      .insert({
        task_id: taskId,
        file_name: fileName.slice(0, 255),
        storage_path: storagePath,
        storage_bucket: "task-attachments",
        file_size: Math.round(fileSize),
        mime_type:
          typeof body.mimeType === "string"
            ? body.mimeType.slice(0, 120)
            : null,
        uploaded_by: user.id,
      })
      .select(
        "id,task_id,file_name,storage_path,storage_bucket,file_size,mime_type,uploaded_by,created_at",
      )
      .single();
    if (error) {
      if ((error as { code?: string }).code === "42501") {
        return forbiddenResponse();
      }
      throw error;
    }
    return createdResponse(created);
  } catch (error) {
    console.error("POST /api/tasks/[id]/attachments failed:", error);
    return internalErrorResponse();
  }
}
