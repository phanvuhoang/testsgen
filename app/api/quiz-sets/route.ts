import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET /api/quiz-sets — List quiz sets for the authenticated user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    createdById: session.user.id,
  };

  // Admin can see all
  if (session.user.role === "admin") {
    delete (where as Record<string, unknown>).createdById;
  }

  if (search) {
    (where as Record<string, unknown>).OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) {
    (where as Record<string, unknown>).status = status.toUpperCase();
  }

  const [quizSets, total] = await Promise.all([
    db.quizSet.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { questions: true, attempts: true },
        },
      },
    }),
    db.quizSet.count({ where }),
  ]);

  return NextResponse.json({
    quizSets,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// POST /api/quiz-sets — Create a new quiz set
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    description,
    questionsPerAttempt = 20,
    timeLimitMinutes,
    showAnswers = true,
    passMark = 50,
    maxAttempts,
    access = "PUBLIC",
    passcode,
    allowedEmails,
    randomizeQuestions = true,
    displayMode = "ONE_AT_ONCE",
    expiresAt,
    tags,
    theme,
    passMessage,
    failMessage,
    easyPercent = 20,
    mediumPercent = 60,
    hardPercent = 20,
    identifyBy = "EMAIL",
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const quizSet = await db.quizSet.create({
    data: {
      title,
      description: description ?? null,
      createdById: session.user.id,
      status: "DRAFT",
      questionsPerAttempt,
      timeLimitMinutes: timeLimitMinutes ?? null,
      showAnswers,
      passMark,
      maxAttempts: maxAttempts ?? null,
      access,
      passcode: passcode ?? null,
      allowedEmails: allowedEmails ?? null,
      randomizeQuestions,
      displayMode,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      tags: tags ?? [],
      theme: theme ?? "default",
      passMessage: passMessage ?? null,
      failMessage: failMessage ?? null,
      easyPercent,
      mediumPercent,
      hardPercent,
      identifyBy,
    },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return NextResponse.json(quizSet, { status: 201 });
}
