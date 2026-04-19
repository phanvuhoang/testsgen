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
    session.user.role === "ADMIN"
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
        answers: {
          select: {
            id: true,
            quizQuestionId: true,
            answer: true,
            isCorrect: true,
            marksAwarded: true,
            quizQuestion: {
              select: { stem: true, correctAnswer: true, questionType: true }
            }
          }
        }
      },
    }),
    db.attempt.count({ where: { quizSetId: params.id } }),
  ]);

  // Aggregate stats
  const submittedAttempts = await db.attempt.findMany({
    where: { quizSetId: params.id, status: { in: ["SUBMITTED", "GRADED"] } },
    select: {
      totalScore: true,
      maxScore: true,
      answers: {
        select: {
          id: true,
          quizQuestionId: true,
          answer: true,
          isCorrect: true,
          marksAwarded: true,
          quizQuestion: {
            select: { stem: true, correctAnswer: true, questionType: true }
          }
        }
      }
    },
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

  // Compute per-question stats from all submitted attempts' answers
  const allAnswers = submittedAttempts.flatMap((a: any) => a.answers || [])
  const questionMap = new Map<string, { stem: string; answers: Array<{answer: string; isCorrect: boolean}> }>()
  for (const ans of allAnswers) {
    if (!ans.quizQuestionId || !ans.quizQuestion) continue
    const key = ans.quizQuestionId
    if (!questionMap.has(key)) {
      questionMap.set(key, { stem: ans.quizQuestion.stem, answers: [] })
    }
    questionMap.get(key)!.answers.push({ answer: ans.answer ?? '', isCorrect: ans.isCorrect ?? false })
  }
  const questionStats = Array.from(questionMap.entries()).map(([, v]) => {
    const total = v.answers.length
    const correct = v.answers.filter(a => a.isCorrect).length
    const wrongAnswers = v.answers.filter(a => !a.isCorrect).map(a => a.answer).filter(Boolean)
    const freq = wrongAnswers.reduce((acc: Record<string, number>, a) => { acc[a] = (acc[a] || 0) + 1; return acc }, {})
    const topWrong = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    return { stem: v.stem, correctCount: correct, totalCount: total, pct: total > 0 ? Math.round(correct/total*100) : 0, topWrongAnswer: topWrong }
  })

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
      questionStats,
    },
  });
}
