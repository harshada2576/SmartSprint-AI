import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { invitations, organizations } from "@supabase/schema";
import { eq } from "drizzle-orm";
import { internalErrorResponse, successResponse } from "@/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ success: false, error: { message: "Token is required" } }, { status: 400 });
    }

    const rows = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        organizationId: invitations.organizationId,
        organizationName: organizations.name,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(eq(invitations.id, token))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: { message: "Invitation not found" } }, { status: 404 });
    }

    const invite = rows[0];
    if (invite.status !== "pending") {
      return NextResponse.json(
        { success: false, error: { message: `This invitation has already been ${invite.status}.` } },
        { status: 400 }
      );
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: { message: "This invitation has expired." } },
        { status: 400 }
      );
    }

    return successResponse(invite);
  } catch (err) {
    console.error("GET /api/invitations/verify error:", err);
    return internalErrorResponse();
  }
}
