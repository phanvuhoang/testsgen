import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET /api/quiz-sets/[id]/attempts — List attempts for a quiz set (owner/admin view)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "admin"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;

  const [attempts, total] = await Promise.all([
    db.attempt.findMany({
      where: { quizSetId: params.id },
      skip,
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    db.attempt.count({ where: { quizSetId: params.id } }),
  ]);

  // Aggregate stats
  const submittedAttempts = await db.attempt.findMany({
    where: { quizSetId: params.id, status: { in: ["SUBMITTED", "GRADED"] } },
    select: { totalScore: true, maxScore: true },
  });

  const scores = submittedAttempts
    .filter((a) => a.totalScore !== null && a.maxScore !== null && a.maxScore! > 0)
    .map((a) => Math.round(((a.totalScore ?? 0) / (a.maxScore ?? 1)) * 100));

  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const passCount =
    quizSet.passMark !== null
      ? scores.filter((s) => s >= quizSet.passMark).length
      : null;

  return NextResponse.json({
    attempts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    stats: {
      total,
      submitted: submittedAttempts.length,
      avgScore,
      passCount,
      passRate:
        passCount !== null && submittedAttempts.length > 0
          ? Math.round((passCount / submittedAttempts.length) * 100)
          : null,
    },
  });
}
