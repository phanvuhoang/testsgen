import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// PATCH /api/quiz-sets/[id]/variants/[variantId] — update a variant
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const variant = await db.quizVariant.findFirst({
    where: { id: params.variantId, quizSetId: params.id },
  })
  if (!variant) return NextResponse.json({ error: 'Variant not found' }, { status: 404 })

  const body = await req.json()
  const updated = await db.quizVariant.update({
    where: { id: params.variantId },
    data: {
      name: body.name?.trim() ?? variant.name,
      description: body.description !== undefined ? body.description : variant.description,
      questionsPerAttempt: body.questionsPerAttempt !== undefined ? body.questionsPerAttempt : variant.questionsPerAttempt,
      timeLimitMinutes: body.timeLimitMinutes !== undefined ? body.timeLimitMinutes : variant.timeLimitMinutes,
      passMark: body.passMark !== undefined ? body.passMark : variant.passMark,
      randomizeQuestions: body.randomizeQuestions !== undefined ? body.randomizeQuestions : variant.randomizeQuestions,
      displayMode: body.displayMode !== undefined ? body.displayMode : variant.displayMode,
      questionFilter: body.questionFilter !== undefined
        ? (body.questionFilter ? JSON.stringify(body.questionFilter) : null)
        : variant.questionFilter,
      shuffleAnswerOptions: body.shuffleAnswerOptions !== undefined ? body.shuffleAnswerOptions : variant.shuffleAnswerOptions,
      fixedQuestionIds: body.fixedQuestionIds !== undefined ? body.fixedQuestionIds : variant.fixedQuestionIds,
      disablePrevButton: body.disablePrevButton !== undefined ? body.disablePrevButton : variant.disablePrevButton,
      requireLogin: body.requireLogin !== undefined ? body.requireLogin : variant.requireLogin,
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/quiz-sets/[id]/variants/[variantId] — delete a variant
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.quizVariant.deleteMany({
    where: { id: params.variantId, quizSetId: params.id },
  })

  return NextResponse.json({ ok: true })
}
