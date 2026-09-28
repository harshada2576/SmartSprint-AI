import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/auth/service-role-server";
import { db } from "@/db";
import { invitations, organizations, users, organizationMembers, activityLogs } from "@supabase/schema";
import { eq, and } from "drizzle-orm";
import { internalErrorResponse, successResponse } from "@/api/response";

export const dynamic = "force-dynamic";

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "U";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: { message: "Invalid payload" } }, { status: 400 });
    }

    const { token, firstName, lastName, password } = body as Record<string, string>;
    if (!token || !firstName || !lastName || !password) {
      return NextResponse.json(
        { success: false, error: { message: "token, firstName, lastName, and password are required" } },
        { status: 400 }
      );
    }

    // Verify invitation
    const [invite] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, token))
      .limit(1);

    if (!invite) {
      return NextResponse.json({ success: false, error: { message: "Invitation not found" } }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { success: false, error: { message: `This invitation is already ${invite.status}` } },
        { status: 400 }
      );
    }

    const serviceClient = getServiceRoleClient();

    // Find or create auth user
    let userId: string;

    // Check if auth user already exists with this email
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
    );

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      // Update password if requested
      await serviceClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
    } else {
      const { data: newUser, error: createAuthError } = await serviceClient.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (createAuthError || !newUser?.user) {
        return NextResponse.json(
          { success: false, error: { message: createAuthError?.message ?? "Could not create user account" } },
          { status: 500 }
        );
      }
      userId = newUser.user.id;
    }

    // Upsert public.users profile
    await db
      .insert(users)
      .values({
        id: userId,
        firstName,
        lastName,
        email: invite.email,
        avatarInitials: initials(firstName, lastName),
        status: "active",
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          firstName,
          lastName,
          avatarInitials: initials(firstName, lastName),
          updatedAt: new Date().toISOString(),
        },
      });

    // Add to organization_members with the invitation's exact role
    await db
      .insert(organizationMembers)
      .values({
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: {
          role: invite.role,
        },
      });

    // Mark invitation accepted
    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, token));

    // Log activity
    await db.insert(activityLogs).values({
      organizationId: invite.organizationId,
      userId,
      action: "created",
      entityType: "team",
      entityId: userId,
      value: `Accepted invitation as ${invite.role}`,
    });

    return successResponse({
      email: invite.email,
      role: invite.role,
      organizationId: invite.organizationId,
    });
  } catch (err) {
    console.error("POST /api/invitations/accept error:", err);
    return internalErrorResponse();
  }
}
