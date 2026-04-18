import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "admin"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const questions = await db.quizQuestion.findMany({
    where: { quizSetId: params.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(questions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "admin"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    stem,
    questionType = "MCQ",
    options,
    correctAnswer,
    explanation,
    difficulty = "MEDIUM",
    points = 1,
  } = body;

  if (!stem || !correctAnswer) {
    return NextResponse.json(
      { error: "stem and correctAnswer are required" },
      { status: 400 }
    );
  }

  const newQuestion = await db.quizQuestion.create({
    data: {
      quizSetId: params.id,
      stem,
      questionType,
      options: options ?? [],
      correctAnswer,
      explanation: explanation ?? null,
      difficulty,
      points,
    },
  });

  return NextResponse.json(newQuestion, { status: 201 });
}
