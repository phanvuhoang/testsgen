import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// POST /api/quiz-sets/[id]/import-questions
// Body: { sourceQuizSetId: string, questionIds: string[] }
// Copies selected questions from another quiz set into this one
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const targetQuizSet = await db.quizSet.findFirst({ where })
  if (!targetQuizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { sourceQuizSetId, questionIds } = body

  if (!sourceQuizSetId || !Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json({ error: 'sourceQuizSetId and questionIds are required' }, { status: 400 })
  }

  // Fetch source questions
  const sourceQuestions = await db.quizQuestion.findMany({
    where: {
      id: { in: questionIds },
      quizSetId: sourceQuizSetId,
    },
  })

  if (sourceQuestions.length === 0) {
    return NextResponse.json({ error: 'No questions found' }, { status: 404 })
  }

  // Get current max sortOrder in target
  const lastQ = await db.quizQuestion.findFirst({
    where: { quizSetId: params.id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  let nextSortOrder = (lastQ?.sortOrder ?? 0) + 1

  // Copy questions
  const created = await Promise.all(
    sourceQuestions.map(async (q) => {
      const newQ = await db.quizQuestion.create({
        data: {
          quizSetId: params.id,
          stem: q.stem,
          questionType: q.questionType,
          options: q.options ?? undefined,
          correctAnswer: q.correctAnswer ?? undefined,
          explanation: q.explanation ?? undefined,
          difficulty: q.difficulty,
          points: q.points,
          poolTag: q.poolTag ?? undefined,
          sortOrder: nextSortOrder++,
        },
      })
      return newQ
    })
  )

  return NextResponse.json({ imported: created.length, questions: created }, { status: 201 })
}

// GET /api/quiz-sets/[id]/import-questions?search=...
// Returns a list of quiz sets (with question count) that the user can import from
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const search = url.searchParams.get('search') || ''

  const createdByCondition =
    session.user.role === 'ADMIN'
      ? {}
      : { createdById: session.user.id }

  const quizSets = await db.quizSet.findMany({
    where: {
      ...createdByCondition,
      id: { not: params.id }, // exclude current quiz set
      title: search ? { contains: search, mode: 'insensitive' } : undefined,
    },
    select: {
      id: true,
      title: true,
      _count: { select: { questions: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(
    quizSets.map((qs) => ({
      id: qs.id,
      title: qs.title,
      questionCount: qs._count.questions,
    }))
  )
}
