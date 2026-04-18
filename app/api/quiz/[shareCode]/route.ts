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
      status: "OPEN",
    },
    include: {
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          stem: true,
          questionType: true,
          options: true,
          difficulty: true,
          points: true,
          sortOrder: true,
          poolTag: true,
          // Do NOT expose correctAnswer or explanation here
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

  // Check access
  if (quizSet.access === "EMAIL_LIST") {
    // handled at attempt start
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
    introText: quizSet.introText,
    conclusionText: quizSet.conclusionText,
    // Per-question feedback settings
    feedbackShowCorrect: quizSet.feedbackShowCorrect,
    feedbackShowAnswer: quizSet.feedbackShowAnswer,
    feedbackShowExplanation: quizSet.feedbackShowExplanation,
    // Certificate
    certificateEnabled: quizSet.certificateEnabled,
    certificateTitle: quizSet.certificateTitle,
    certificateMessage: quizSet.certificateMessage,
    // Theme
    themeColor: quizSet.themeColor,
    themeFont: quizSet.themeFont,
    themeLogo: quizSet.themeLogo,
    // Anti-cheat
    disableRightClick: quizSet.disableRightClick,
    disableCopyPaste: quizSet.disableCopyPaste,
    disableTranslate: quizSet.disableTranslate,
    disablePrint: quizSet.disablePrint,
    // Review settings
    showScore: quizSet.showScore,
    showOutline: quizSet.showOutline,
    showCorrectAnswers: quizSet.showCorrectAnswers,
    questionCount: quizSet.questions.length,
    questions: quizSet.questions,
    createdBy: quizSet.createdBy?.name ?? "Unknown",
  });
}
