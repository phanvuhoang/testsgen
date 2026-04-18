import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// GET /api/users/[id] — Get user by id (admin or self)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "admin";
  const isSelf = session.user.id === params.id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      _count: {
        select: { quizSets: true, projects: true, attempts: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

// PATCH /api/users/[id] — Update user
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "admin";
  const isSelf = session.user.id === params.id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetUser = await db.user.findUnique({ where: { id: params.id } });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  // Fields anyone can update on themselves
  if (body.name !== undefined) updates.name = body.name;

  // Admin-only fields
  if (isAdmin) {
    if (body.role !== undefined) {
      const validRoles = ["ADMIN", "TEACHER", "STUDENT"];
      const normalizedRole = body.role.toUpperCase();
      if (!validRoles.includes(normalizedRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.role = normalizedRole;
    }
    if (body.status !== undefined) {
      const validStatuses = ["ACTIVE", "INACTIVE"];
      const normalizedStatus = body.status.toUpperCase();
      if (!validStatuses.includes(normalizedStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = normalizedStatus;
    }
    if (body.email !== undefined) {
      if (body.email !== targetUser.email) {
        const existing = await db.user.findUnique({ where: { email: body.email } });
        if (existing) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
      }
      updates.email = body.email;
    }
    if (body.password !== undefined) {
      updates.password = await bcrypt.hash(body.password, 12);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: params.id },
    data: updates,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/users/[id] — Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent self-deletion
  if (session.user.id === params.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({ where: { id: params.id } });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.user.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
