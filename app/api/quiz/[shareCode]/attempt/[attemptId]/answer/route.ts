import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/quiz/[shareCode]/attempt/[attemptId]/answer
// Save or update an answer for a question in an in-progress attempt
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; attemptId: string } }
) {
  // shareCode may be either a QuizSet shareCode or a QuizClass shareCode.
  // Resolve quizSetId so we can find the attempt regardless of which shareCode is used.
  let resolvedQuizSetId: string | null = null;

  const quizSetByCode = await db.quizSet.findFirst({
    where: { shareCode: params.shareCode },
    select: { id: true },
  });
  if (quizSetByCode) {
    resolvedQuizSetId = quizSetByCode.id;
  } else {
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
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Attempt already completed" }, { status: 409 });
  }

  const body = await req.json();
  // Accept both questionId and quizQuestionId (frontend sends quizQuestionId)
  const questionId = body.questionId ?? body.quizQuestionId;
  const { answer } = body;

  if (!questionId || answer === undefined) {
    return NextResponse.json(
      { error: "questionId (or quizQuestionId) and answer are required" },
      { status: 400 }
    );
  }

  // Verify the question belongs to this quiz
  const question = await db.quizQuestion.findFirst({
    where: {
      id: questionId,
      quizSetId: attempt.quizSetId!,
    },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  // Upsert the answer
  const savedAnswer = await db.attemptAnswer.upsert({
    where: {
      attemptId_quizQuestionId: {
        attemptId: params.attemptId,
        quizQuestionId: questionId,
      },
    },
    create: {
      attemptId: params.attemptId,
      quizQuestionId: questionId,
      answer: String(answer),
    },
    update: {
      answer: String(answer),
    },
  });

  return NextResponse.json(savedAnswer);
}
