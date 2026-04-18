import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/quiz/[shareCode] — Public: get quiz metadata + questions (no correct answers)
export async function GET(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  const quizSet = await db.quizSet.findFirst({
    where: {
      shareCode: params.shareCode,
      access: { in: ["PUBLIC", "PASSCODE"] },
      status: "OPEN",
    },
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          stem: true,
          questionType: true,
          options: true,
          difficulty: true,
          points: true,
          // Do NOT expose correctAnswer or explanation
        },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });

  if (!quizSet) {
    return NextResponse.json({ error: "Quiz not found or not available" }, { status: 404 });
  }

  // Check expiry
  if (quizSet.expiresAt && quizSet.expiresAt < new Date()) {
    return NextResponse.json({ error: "This quiz has expired" }, { status: 410 });
  }

  return NextResponse.json({
    id: quizSet.id,
    title: quizSet.title,
    description: quizSet.description,
    shareCode: quizSet.shareCode,
    timeLimitMinutes: quizSet.timeLimitMinutes,
    passMark: quizSet.passMark,
    randomizeQuestions: quizSet.randomizeQuestions,
    showAnswers: quizSet.showAnswers,
    displayMode: quizSet.displayMode,
    questionsPerAttempt: quizSet.questionsPerAttempt,
    access: quizSet.access,
    maxAttempts: quizSet.maxAttempts,
    expiresAt: quizSet.expiresAt,
    passMessage: quizSet.passMessage,
    failMessage: quizSet.failMessage,
    identifyBy: quizSet.identifyBy,
    questionCount: quizSet.questions.length,
    questions: quizSet.questions,
    createdBy: quizSet.createdBy?.name ?? "Unknown",
  });
}
