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
    correctAnswer: string;
    points: number;
    earnedPoints: number;
    explanation: string | null;
  }[] = [];

  for (const q of questions) {
    totalPoints += q.points;
    const answerRecord = answerMap.get(q.id);
    const userAnswer = answerRecord?.answer ?? "";

    let isCorrect = false;

    if (q.questionType === "MCQ" || q.questionType === "TRUE_FALSE") {
      isCorrect =
        userAnswer.trim().toLowerCase() ===
        (q.correctAnswer ?? "").trim().toLowerCase();
    } else if (q.questionType === "SHORT_ANSWER") {
      // Simple text match
      isCorrect =
        userAnswer.trim().toLowerCase() ===
        (q.correctAnswer ?? "").trim().toLowerCase();
    }

    const earned = isCorrect ? q.points : 0;
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

    gradedAnswers.push({
      questionId: q.id,
      stem: q.stem,
      answer: userAnswer,
      correct: isCorrect,
      correctAnswer: attempt.quizSet!.showAnswers ? (q.correctAnswer ?? "") : "",
      points: q.points,
      earnedPoints: earned,
      explanation: attempt.quizSet!.showAnswers ? q.explanation : null,
    });
  }

  const scorePercentage =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  const passed =
    attempt.quizSet!.passMark !== null
      ? scorePercentage >= attempt.quizSet!.passMark
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

  const quizSet = attempt.quizSet!;

  return NextResponse.json({
    attemptId: params.attemptId,
    score: scorePercentage,
    earnedPoints,
    totalPoints,
    passed,
    timeTaken,
    passMessage: passed ? quizSet.passMessage : quizSet.failMessage,
    answers: gradedAnswers,
  });
}
