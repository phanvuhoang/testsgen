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

  const quizSet = await db.quizSet.findFirst({
    where,
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { attempts: true },
      },
    },
  });

  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(quizSet);
}

export async function PATCH(
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
    title,
    description,
    status,
    questionsPerAttempt,
    timeLimitMinutes,
    showAnswers,
    passMark,
    maxAttempts,
    access,
    passcode,
    allowedEmails,
    randomizeQuestions,
    displayMode,
    expiresAt,
    tags,
    theme,
    passMessage,
    failMessage,
    easyPercent,
    mediumPercent,
    hardPercent,
    identifyBy,
  } = body;

  const updated = await db.quizSet.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status: status.toUpperCase() }),
      ...(questionsPerAttempt !== undefined && { questionsPerAttempt }),
      ...(timeLimitMinutes !== undefined && { timeLimitMinutes }),
      ...(showAnswers !== undefined && { showAnswers }),
      ...(passMark !== undefined && { passMark }),
      ...(maxAttempts !== undefined && { maxAttempts }),
      ...(access !== undefined && { access }),
      ...(passcode !== undefined && { passcode }),
      ...(allowedEmails !== undefined && { allowedEmails }),
      ...(randomizeQuestions !== undefined && { randomizeQuestions }),
      ...(displayMode !== undefined && { displayMode }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(tags !== undefined && { tags }),
      ...(theme !== undefined && { theme }),
      ...(passMessage !== undefined && { passMessage }),
      ...(failMessage !== undefined && { failMessage }),
      ...(easyPercent !== undefined && { easyPercent }),
      ...(mediumPercent !== undefined && { mediumPercent }),
      ...(hardPercent !== undefined && { hardPercent }),
      ...(identifyBy !== undefined && { identifyBy }),
    },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
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

  await db.quizSet.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
