import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/quiz/[shareCode]/attempt/[attemptId]/submit
// Finalize attempt: auto-grade MCQ/TRUE_FALSE, compute score
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; attemptId: string } }
) {
  const attempt = await db.attempt.findFirst({
    where: {
      id: params.attemptId,
      quizSet: { shareCode: params.shareCode },
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
      // Case-insensitive match; accept any correct answer variant (||‐delimited)
      const correctVariants = (q.correctAnswer ?? "")
        .split("||")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      isCorrect = correctVariants.includes(userAnswer.trim().toLowerCase())
    } else if (q.questionType === "FILL_BLANK") {
      // Case-insensitive, trimmed match; also accept ||‐delimited variants
      const correctVariants = (q.correctAnswer ?? "")
        .split("||")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      isCorrect = correctVariants.length > 0
        ? correctVariants.includes(userAnswer.trim().toLowerCase())
        : userAnswer.trim().toLowerCase() === (q.correctAnswer ?? "").trim().toLowerCase()
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
