import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const questions = await db.question.findMany({
    where: { sessionId: params.id },
    include: { section: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(questions)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const q = await db.question.create({
    data: {
      sessionId: params.id,
      sectionId: body.sectionId,
      stem: body.stem,
      options: body.options,
      correctAnswer: body.correctAnswer,
      markingScheme: body.markingScheme,
      modelAnswer: body.modelAnswer,
      topic: body.topic,
      difficulty: body.difficulty || 'MEDIUM',
      status: body.status || 'NEEDS_REVIEW',
      questionType: body.questionType || 'MCQ_SINGLE',
      marks: body.marks || 1,
    },
    include: { section: { select: { id: true, name: true } } },
  })
  return NextResponse.json(q, { status: 201 })
}
