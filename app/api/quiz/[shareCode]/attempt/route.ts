import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// POST /api/quiz/[shareCode]/attempt — Start a new quiz attempt
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  // Auth is optional for public quizzes
  const session = await auth();

  const quizSet = await db.quizSet.findFirst({
    where: {
      shareCode: params.shareCode,
      status: "OPEN",
    },
    include: {
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, difficulty: true, sortOrder: true },
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

  // Check max attempts if user is logged in
  if (quizSet.maxAttempts && session?.user?.id) {
    const attemptCount = await db.attempt.count({
      where: {
        quizSetId: quizSet.id,
        userId: session.user.id,
        status: { in: ["SUBMITTED", "GRADED"] },
      },
    });
    if (attemptCount >= quizSet.maxAttempts) {
      return NextResponse.json(
        { error: "Maximum attempts reached" },
        { status: 409 }
      );
    }
  }

  const body = await req.json().catch(() => ({}));
  const { guestName, guestEmail, passcode, variantId, fixedQuestionIds, shuffleAnswerOptions } = body;

  // Validate passcode if required
  if (quizSet.access === "PASSCODE") {
    if (!passcode || passcode !== quizSet.passcode) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 403 });
    }
  }

  // Select questions based on difficulty percentages
  let allQuestions = [...quizSet.questions];

  // Apply difficulty mix
  const totalToSelect = Math.min(quizSet.questionsPerAttempt, allQuestions.length);

  let selectedQuestions: typeof allQuestions;

  // If fixedQuestionIds provided, use those specific questions in order
  if (fixedQuestionIds && Array.isArray(fixedQuestionIds) && fixedQuestionIds.length > 0) {
    const idSet = new Set(fixedQuestionIds)
    selectedQuestions = fixedQuestionIds
      .map((id: string) => allQuestions.find(q => q.id === id))
      .filter(Boolean) as typeof allQuestions
  } else if (quizSet.randomizeQuestions) {
    const easy = allQuestions.filter((q) => q.difficulty === "EASY");
    const medium = allQuestions.filter((q) => q.difficulty === "MEDIUM");
    const hard = allQuestions.filter((q) => q.difficulty === "HARD");

    const easyCount = Math.round((quizSet.easyPercent / 100) * totalToSelect);
    const hardCount = Math.round((quizSet.hardPercent / 100) * totalToSelect);
    const mediumCount = totalToSelect - easyCount - hardCount;

    const pick = <T>(arr: T[], n: number): T[] => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(n, shuffled.length));
    };

    selectedQuestions = [
      ...pick(easy, easyCount),
      ...pick(medium, mediumCount),
      ...pick(hard, hardCount),
    ].sort(() => Math.random() - 0.5);

    // If we don't have enough from specific difficulties, fill from remaining
    if (selectedQuestions.length < totalToSelect) {
      const selectedIds = new Set(selectedQuestions.map((q) => q.id));
      const remaining = allQuestions
        .filter((q) => !selectedIds.has(q.id))
        .sort(() => Math.random() - 0.5);
      selectedQuestions.push(
        ...remaining.slice(0, totalToSelect - selectedQuestions.length)
      );
    }
  } else {
    selectedQuestions = allQuestions.slice(0, totalToSelect);
  }

  const questionOrder = selectedQuestions.map((q) => q.id);

  // Build questions snapshot (without correct answers)
  const questionsForSnapshot = await db.quizQuestion.findMany({
    where: { id: { in: questionOrder } },
    select: {
      id: true,
      stem: true,
      questionType: true,
      options: true,
      correctAnswer: true,   // included for per-question feedback
      explanation: true,     // included for per-question feedback
      difficulty: true,
      points: true,
      sortOrder: true,
      poolTag: true,
    },
  });

  const snapshotMap = new Map(questionsForSnapshot.map((q) => [q.id, q]));
  // Map each question so frontend gets quizQuestionId = the DB question id
  const questionsSnapshot = questionOrder
    .map((id) => snapshotMap.get(id))
    .filter(Boolean)
    .map((q) => ({
      ...q,
      quizQuestionId: q!.id, // critical: expose as quizQuestionId for frontend
    }));

  const attempt = await db.attempt.create({
    data: {
      quizSetId: quizSet.id,
      userId: session?.user?.id ?? null,
      guestName: guestName ?? session?.user?.name ?? null,
      guestEmail: guestEmail ?? session?.user?.email ?? null,
      questionsSnapshot: questionsSnapshot as any,
      status: "IN_PROGRESS",
      variantId: variantId ?? null,
    },
  });

  return NextResponse.json(
    {
      attemptId: attempt.id,
      questionOrder,
      questions: questionsSnapshot,
      startedAt: attempt.startedAt,
      timeLimitMinutes: quizSet.timeLimitMinutes,
    },
    { status: 201 }
  );
}
