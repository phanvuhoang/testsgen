import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; qId: string } }
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

  const question = await db.quizQuestion.findFirst({
    where: { id: params.qId, quizSetId: params.id },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const body = await req.json();
  const { stem, questionType, options, correctAnswer, explanation, difficulty, points, sortOrder, topic, tags, imageUrl } = body;

  const updated = await db.quizQuestion.update({
    where: { id: params.qId },
    data: {
      ...(stem !== undefined && { stem }),
      ...(questionType !== undefined && { questionType }),
      ...(options !== undefined && { options }),
      ...(correctAnswer !== undefined && { correctAnswer }),
      ...(explanation !== undefined && { explanation }),
      ...(difficulty !== undefined && { difficulty }),
      ...(points !== undefined && { points }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(topic !== undefined && { topic: topic || null }),
      ...(tags !== undefined && { tags: tags || null }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; qId: string } }
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

  const question = await db.quizQuestion.findFirst({
    where: { id: params.qId, quizSetId: params.id },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  await db.quizQuestion.delete({ where: { id: params.qId } });

  return NextResponse.json({ success: true });
}
