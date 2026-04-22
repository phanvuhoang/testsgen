import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const body = await req.json()
  const q = await (db as any).parsedQuestion.update({
    where: { id: params.qId },
    data: {
      title: body.title !== undefined ? body.title : undefined,
      content: body.content !== undefined ? body.content : undefined,
      answer: body.answer !== undefined ? body.answer : undefined,
      questionType: body.questionType !== undefined ? body.questionType : undefined,
      topicId: body.topicId !== undefined ? body.topicId : undefined,
      topicName: body.topicName !== undefined ? body.topicName : undefined,
      sectionId: body.sectionId !== undefined ? body.sectionId : undefined,
      sectionName: body.sectionName !== undefined ? body.sectionName : undefined,
      syllabusCode: body.syllabusCode !== undefined ? body.syllabusCode : undefined,
      difficulty: body.difficulty !== undefined ? body.difficulty : undefined,
    },
  })
  return NextResponse.json(q)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  await (db as any).parsedQuestion.delete({ where: { id: params.qId } })
  return NextResponse.json({ ok: true })
}
