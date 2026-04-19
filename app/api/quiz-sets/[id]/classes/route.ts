import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const classes = await db.quizClass.findMany({
      where: { quizSetId: params.id },
      include: {
        _count: { select: { attempts: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(classes)
  } catch (err) {
    console.error('Classes fetch error:', err)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    name, description, timeLimitMinutes, questionsPerAttempt, passMark,
    randomizeQuestions, shuffleAnswerOptions, disablePrevButton, displayMode,
    requireLogin, maxAttempts, fixedQuestionIds, autoSendResults, autoSendResultType
  } = body

  // Get parent to copy default settings
  const parent = await db.quizSet.findFirst({ where: { id: params.id } })
  if (!parent) return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 })

  const cls = await db.quizClass.create({
    data: {
      name: name || 'New Class',
      description: description || null,
      quizSetId: params.id,
      timeLimitMinutes: timeLimitMinutes ?? parent.timeLimitMinutes,
      questionsPerAttempt: questionsPerAttempt ?? parent.questionsPerAttempt,
      passMark: passMark ?? parent.passMark,
      randomizeQuestions: randomizeQuestions ?? parent.randomizeQuestions,
      shuffleAnswerOptions: shuffleAnswerOptions ?? false,
      disablePrevButton: disablePrevButton ?? false,
      displayMode: displayMode ?? parent.displayMode,
      requireLogin: requireLogin ?? parent.requireLogin ?? false,
      maxAttempts: maxAttempts ?? parent.maxAttempts,
      fixedQuestionIds: fixedQuestionIds ? JSON.stringify(fixedQuestionIds) : null,
      autoSendResults: autoSendResults ?? false,
      autoSendResultType: autoSendResultType ?? 'comprehensive',
    }
  })

  return NextResponse.json(cls)
}
