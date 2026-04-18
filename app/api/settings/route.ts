import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET /api/settings — Get all system settings (admin only for sensitive keys)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await db.systemSetting.findMany({
    orderBy: { key: "asc" },
  });

  // Mask sensitive values
  const masked = settings.map((s) => ({
    ...s,
    value:
      s.key === "ai_api_key" && s.value
        ? `${s.value.substring(0, 8)}${"*".repeat(Math.max(0, s.value.length - 8))}`
        : s.value,
  }));

  return NextResponse.json(masked);
}

// PATCH /api/settings — Update system settings (admin only)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  // body is an object: { key: value, ... }
  // Or an array of { key, value } pairs

  const updates: { key: string; value: string }[] = Array.isArray(body)
    ? body
    : Object.entries(body).map(([key, value]) => ({ key, value: String(value) }));

  if (updates.length === 0) {
    return NextResponse.json({ error: "No settings to update" }, { status: 400 });
  }

  const results = [];
  for (const { key, value } of updates) {
    const updated = await db.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    results.push(updated);
  }

  return NextResponse.json({ updated: results.length, settings: results });
}
