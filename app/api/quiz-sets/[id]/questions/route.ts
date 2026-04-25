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
    session.user.role === "ADMIN"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const questions = await db.quizQuestion.findMany({
    where: { quizSetId: params.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      quizSetId: true,
      stem: true,
      questionType: true,
      options: true,
      correctAnswer: true,
      explanation: true,
      difficulty: true,
      points: true,
      sortOrder: true,
      poolTag: true,
      topic: true,
      tags: true,
      createdAt: true,
    } as any,
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
    session.user.role === "ADMIN"
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
    sortOrder,
    poolTag,
    imageUrl,
  } = body;

  // TEXT_BLOCK does not require stem or correctAnswer strictly, but stem is needed
  if (!stem) {
    return NextResponse.json(
      { error: "stem is required" },
      { status: 400 }
    );
  }

  // For non-interactive types, correctAnswer is optional
  const nonInteractiveTypes = ["TEXT_BLOCK", "ESSAY", "LONG_ANSWER"];
  if (!correctAnswer && !nonInteractiveTypes.includes(questionType)) {
    // Allow missing correctAnswer for essay/long-answer types
    // For other types, it's generally expected but not hard-enforced here
  }

  // Determine sortOrder: if not provided, use (max existing sortOrder + 1)
  let resolvedSortOrder = sortOrder;
  if (resolvedSortOrder === undefined || resolvedSortOrder === null) {
    const maxResult = await db.quizQuestion.aggregate({
      where: { quizSetId: params.id },
      _max: { sortOrder: true },
    });
    resolvedSortOrder = (maxResult._max.sortOrder ?? -1) + 1;
  }

  // Normalize options: can be JSON string (for MATCHING) or array
  let normalizedOptions: unknown = options ?? [];
  if (typeof options === "string") {
    try {
      normalizedOptions = JSON.parse(options);
    } catch {
      normalizedOptions = options;
    }
  }

  // For TEXT_BLOCK: force points = 0
  const resolvedPoints = questionType === "TEXT_BLOCK" ? 0 : (points ?? 1);

  const newQuestion = await db.quizQuestion.create({
    data: {
      quizSetId: params.id,
      stem,
      questionType,
      options: normalizedOptions as never,
      correctAnswer: correctAnswer ?? null,
      explanation: explanation ?? null,
      difficulty,
      points: resolvedPoints,
      sortOrder: resolvedSortOrder,
      poolTag: poolTag ?? null,
      ...(imageUrl !== undefined ? { imageUrl: imageUrl ?? null } : {}),
    } as any,
  });

  return NextResponse.json(newQuestion, { status: 201 });
}
