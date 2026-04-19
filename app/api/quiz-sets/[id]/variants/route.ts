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

  try {
    const variants = await db.quizVariant.findMany({
      where: { quizSetId: params.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(variants)
  } catch (err) {
    console.error('Variants fetch error:', err)
    return NextResponse.json([], { status: 200 }) // Return empty array instead of crashing
  }
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
    shuffleAnswerOptions,
    fixedQuestionIds,
    disablePrevButton,
    requireLogin,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Variant name is required' }, { status: 400 })
  }

  try {
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
        shuffleAnswerOptions: shuffleAnswerOptions ?? false,
        fixedQuestionIds: fixedQuestionIds ?? null,
        disablePrevButton: disablePrevButton ?? false,
        requireLogin: requireLogin ?? null,
      },
    })
    return NextResponse.json(variant, { status: 201 })
  } catch (err) {
    console.error('Variant create error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
