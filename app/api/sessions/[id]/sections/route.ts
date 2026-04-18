import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sections = await db.examSection.findMany({
    where: { sessionId: params.id },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(sections)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const sec = await db.examSection.create({
    data: {
      sessionId: params.id,
      name: body.name,
      instructions: body.instructions,
      questionType: body.questionType || 'MCQ_SINGLE',
      marksPerQuestion: body.marksPerQuestion || 1,
      questionsInExam: body.questionsInExam || 10,
      questionsInBank: body.questionsInBank || 40,
      topics: body.topics,
      aiInstructions: body.aiInstructions,
      sortOrder: body.sortOrder || 0,
    },
  })
  return NextResponse.json(sec, { status: 201 })
}
