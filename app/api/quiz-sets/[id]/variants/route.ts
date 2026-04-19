import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// GET /api/quiz-sets/[id]/variants — list all variants for a quiz set
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const variants = await db.quizVariant.findMany({
    where: { quizSetId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(variants)
}

// POST /api/quiz-sets/[id]/variants — create a new variant
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const {
    name,
    description,
    questionsPerAttempt,
    timeLimitMinutes,
    passMark,
    randomizeQuestions,
    displayMode,
    questionFilter,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Variant name is required' }, { status: 400 })
  }

  const variant = await db.quizVariant.create({
    data: {
      quizSetId: params.id,
      name: name.trim(),
      description: description?.trim() || null,
      questionsPerAttempt: questionsPerAttempt ?? null,
      timeLimitMinutes: timeLimitMinutes ?? null,
      passMark: passMark ?? null,
      randomizeQuestions: randomizeQuestions ?? null,
      displayMode: displayMode ?? null,
      questionFilter: questionFilter ? JSON.stringify(questionFilter) : null,
    },
  })

  return NextResponse.json(variant, { status: 201 })
}
