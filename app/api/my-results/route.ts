import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET /api/my-results — Return quiz attempts for the currently logged-in user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const skip = (page - 1) * limit;

  const attempts = await db.attempt.findMany({
    where: { userId: session.user.id },
    skip,
    take: limit,
    orderBy: { startedAt: "desc" },
    include: {
      quizSet: {
        select: {
          id: true,
          title: true,
          shareCode: true,
          passMark: true,
        },
      },
    },
  });

  const total = await db.attempt.count({ where: { userId: session.user.id } });

  const formatted = attempts
    .filter((a) => a.quizSet !== null)
    .map((a) => ({
      id: a.id,
      quizSetId: a.quizSet!.id,
      quizSetTitle: a.quizSet!.title,
      quizSetShareCode: a.quizSet!.shareCode,
      passMark: a.quizSet!.passMark,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      totalScore: a.totalScore,
      maxScore: a.maxScore,
      status: a.status,
    }));

  return NextResponse.json({
    attempts: formatted,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
