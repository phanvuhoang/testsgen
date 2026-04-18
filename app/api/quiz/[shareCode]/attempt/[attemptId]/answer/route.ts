import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/quiz/[shareCode]/attempt/[attemptId]/answer
// Save or update an answer for a question in an in-progress attempt
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; attemptId: string } }
) {
  const attempt = await db.attempt.findFirst({
    where: {
      id: params.attemptId,
      quizSet: { shareCode: params.shareCode },
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Attempt already completed" }, { status: 409 });
  }

  const body = await req.json();
  const { questionId, answer } = body;

  if (!questionId || answer === undefined) {
    return NextResponse.json(
      { error: "questionId and answer are required" },
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
