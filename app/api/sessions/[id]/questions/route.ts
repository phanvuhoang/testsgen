import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : undefined
  const sinceParam = req.nextUrl.searchParams.get('since') // ISO date string

  const where: any = { sessionId: params.id }
  if (sinceParam) {
    const sinceDate = new Date(sinceParam)
    if (!isNaN(sinceDate.getTime())) {
      where.createdAt = { gte: sinceDate }
    }
  }

  const questions = await db.question.findMany({
    where,
    include: { section: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
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
      ...(body.optionExplanations !== undefined ? { optionExplanations: body.optionExplanations } : {}),
      ...(body.syllabusCode !== undefined ? { syllabusCode: body.syllabusCode } : {}),
      ...(body.regulationRefs !== undefined ? { regulationRefs: body.regulationRefs } : {}),
    },
    include: { section: { select: { id: true, name: true } } },
  })
  return NextResponse.json(q, { status: 201 })
}
