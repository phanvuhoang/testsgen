import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string; classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const cls = await db.quizClass.findFirst({ where: { id: params.classId, quizSetId: params.id } })
  if (!cls) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(cls)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const cls = await db.quizClass.update({
    where: { id: params.classId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.timeLimitMinutes !== undefined && { timeLimitMinutes: body.timeLimitMinutes }),
      ...(body.questionsPerAttempt !== undefined && { questionsPerAttempt: body.questionsPerAttempt }),
      ...(body.passMark !== undefined && { passMark: body.passMark }),
      ...(body.randomizeQuestions !== undefined && { randomizeQuestions: body.randomizeQuestions }),
      ...(body.shuffleAnswerOptions !== undefined && { shuffleAnswerOptions: body.shuffleAnswerOptions }),
      ...(body.disablePrevButton !== undefined && { disablePrevButton: body.disablePrevButton }),
      ...(body.displayMode !== undefined && { displayMode: body.displayMode }),
      ...(body.requireLogin !== undefined && { requireLogin: body.requireLogin }),
      ...(body.maxAttempts !== undefined && { maxAttempts: body.maxAttempts }),
      ...(body.fixedQuestionIds !== undefined && { fixedQuestionIds: body.fixedQuestionIds ? JSON.stringify(body.fixedQuestionIds) : null }),
      ...(body.autoSendResults !== undefined && { autoSendResults: body.autoSendResults }),
      ...(body.autoSendResultType !== undefined && { autoSendResultType: body.autoSendResultType }),
    }
  })
  return NextResponse.json(cls)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.quizClass.delete({ where: { id: params.classId } })
  return NextResponse.json({ success: true })
}
