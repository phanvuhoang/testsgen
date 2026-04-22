import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const documentId = searchParams.get('documentId')
  const where: any = { sessionId: params.id }
  if (documentId) where.documentId = documentId
  const questions = await (db as any).parsedQuestion.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(questions)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const q = await (db as any).parsedQuestion.create({
    data: {
      sessionId: params.id,
      documentId: body.documentId ?? null,
      title: body.title ?? null,
      content: body.content,
      answer: body.answer ?? null,
      questionType: body.questionType ?? 'MCQ_SINGLE',
      topicId: body.topicId ?? null,
      topicName: body.topicName ?? null,
      sectionId: body.sectionId ?? null,
      sectionName: body.sectionName ?? null,
      syllabusCode: body.syllabusCode ?? null,
      difficulty: body.difficulty ?? 'MEDIUM',
      sortOrder: body.sortOrder ?? 0,
      isManual: body.isManual ?? false,
    },
  })
  return NextResponse.json(q, { status: 201 })
}
