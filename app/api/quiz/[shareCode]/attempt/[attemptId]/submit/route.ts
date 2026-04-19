import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Remove Vietnamese diacritics for accent-insensitive comparison
function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove combining diacritical marks
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

// POST /api/quiz/[shareCode]/attempt/[attemptId]/submit
// Finalize attempt: auto-grade MCQ/TRUE_FALSE, compute score
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; attemptId: string } }
) {
  // shareCode may be either a QuizSet shareCode or a QuizClass shareCode.
  // Resolve the quizSetId first so we can find the attempt correctly.
  let resolvedQuizSetId: string | null = null;

  const quizSetByCode = await db.quizSet.findFirst({
    where: { shareCode: params.shareCode },
    select: { id: true },
  });
  if (quizSetByCode) {
    resolvedQuizSetId = quizSetByCode.id;
  } else {
    // Try as a class shareCode
    const quizClassByCode = await db.quizClass.findFirst({
      where: { shareCode: params.shareCode },
      select: { quizSetId: true },
    }).catch(() => null);
    if (quizClassByCode) {
      resolvedQuizSetId = quizClassByCode.quizSetId;
    }
  }

  if (!resolvedQuizSetId) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const attempt = await db.attempt.findFirst({
    where: {
      id: params.attemptId,
      quizSetId: resolvedQuizSetId,
    },
    include: {
      quizSet: true,
      answers: {
        include: {
          quizQuestion: true,
        },
      },
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Attempt already submitted" }, { status: 409 });
  }

  // Get all questions for this attempt (from snapshot or from DB)
  const snapshotIds = (attempt.questionsSnapshot as { id: string }[] | null)?.map(
    (q) => q.id
  ) ?? attempt.answers.map((a) => a.quizQuestionId).filter(Boolean) as string[];

  const questions = await db.quizQuestion.findMany({
    where: { id: { in: snapshotIds } },
  });

  const answerMap = new Map(
    attempt.answers.map((a) => [a.quizQuestionId, a])
  );

  let totalPoints = 0;
  let earnedPoints = 0;

  const gradedAnswers: {
    questionId: string;
    stem: string;
    answer: string;
    correct: boolean;
    isCorrect: boolean;
    correctAnswer: string;
    points: number;
    earnedPoints: number;
    marksAwarded: number;
    explanation: string | null;
  }[] = [];

  const quizSet = attempt.quizSet!;

  for (const q of questions) {
    // TEXT_BLOCK and non-interactive types: skip scoring
    if (q.questionType === "TEXT_BLOCK") continue;

    totalPoints += q.points;
    const answerRecord = answerMap.get(q.id);
    const userAnswer = answerRecord?.answer ?? "";

    let isCorrect = false;

    if (q.questionType === "MCQ" || q.questionType === "TRUE_FALSE") {
      isCorrect =
        userAnswer.trim().toLowerCase() ===
        (q.correctAnswer ?? "").trim().toLowerCase();
    } else if (q.questionType === "SHORT_ANSWER") {
      const userNorm = removeAccents(userAnswer)
      const correctVariants = (q.correctAnswer ?? "")
        .split("||")
        .map((s) => removeAccents(s))
        .filter(Boolean)
      isCorrect = correctVariants.length > 0
        ? correctVariants.includes(userNorm)
        : removeAccents(userAnswer) === removeAccents(q.correctAnswer ?? "")
    } else if (q.questionType === "FILL_BLANK") {
      // Case-insensitive + accent-insensitive match; accept ||-delimited variants
      const userNorm = removeAccents(userAnswer)
      const correctVariants = (q.correctAnswer ?? "")
        .split("||")
        .map((s) => removeAccents(s))
        .filter(Boolean)
      isCorrect = correctVariants.length > 0
        ? correctVariants.some(v => removeAccents(userAnswer) === v || userNorm === v)
        : removeAccents(userAnswer) === removeAccents(q.correctAnswer ?? "")
    } else if (q.questionType === "MULTIPLE_RESPONSE") {
      // Compare sorted arrays (answers separated by ||)
      const userSet = userAnswer
        .split("||")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .sort();
      const correctSet = (q.correctAnswer ?? "")
        .split("||")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .sort();
      isCorrect = JSON.stringify(userSet) === JSON.stringify(correctSet);
    }
    // ESSAY, LONG_ANSWER, MATCHING: not auto-graded (isCorrect remains false, earnedPoints = 0)

    let earned = 0;
    if (q.questionType === "MULTIPLE_RESPONSE" && quizSet.partialCredits) {
      // Partial credits: award points proportional to correct selections
      const userSel = userAnswer.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const correctSel = (q.correctAnswer ?? "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (correctSel.length > 0) {
        const correctHits = userSel.filter((s) => correctSel.includes(s)).length;
        const wrongHits = userSel.filter((s) => !correctSel.includes(s)).length;
        const rawRatio = Math.max(0, (correctHits - wrongHits) / correctSel.length)
        earned = Math.round(q.points * rawRatio)
      }
      isCorrect = earned === q.points;
    } else {
      earned = isCorrect ? q.points : 0;
    }
    earnedPoints += earned;

    // Update the answer record
    if (answerRecord) {
      await db.attemptAnswer.update({
        where: { id: answerRecord.id },
        data: {
          isCorrect,
          marksAwarded: earned,
          gradedAt: new Date(),
        },
      });
    }

    // Include correctAnswer and explanation based on quiz settings
    // Always include for feedback purposes (frontend filters display based on settings)
    const showCorrect = quizSet.showAnswers || quizSet.showCorrectAnswers;

    gradedAnswers.push({
      questionId: q.id,
      stem: q.stem,
      answer: userAnswer,
      correct: isCorrect,
      isCorrect,
      correctAnswer: showCorrect ? (q.correctAnswer ?? "") : "",
      points: q.points,
      earnedPoints: earned,
      marksAwarded: earned,
      explanation: quizSet.showAnswers ? q.explanation : null,
    });
  }

  const scorePercentage =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  const passed =
    quizSet.passMark !== null
      ? scorePercentage >= quizSet.passMark
      : null;

  // Finalize attempt
  const submittedAt = new Date();
  const timeTaken = attempt.startedAt
    ? Math.round(
        (submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000
      )
    : null;

  await db.attempt.update({
    where: { id: params.attemptId },
    data: {
      submittedAt,
      totalScore: earnedPoints,
      maxScore: totalPoints,
      status: "SUBMITTED",
    },
  });

  return NextResponse.json({
    attemptId: params.attemptId,
    score: scorePercentage,
    pct: scorePercentage,
    earnedPoints,
    totalPoints,
    totalScore: earnedPoints,
    maxScore: totalPoints,
    passed,
    timeTaken,
    passMessage: passed ? quizSet.passMessage : quizSet.failMessage,
    answers: gradedAnswers,
  });
}
