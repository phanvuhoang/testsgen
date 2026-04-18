import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string; attemptId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionId, answer } = await req.json()

  // Upsert answer
  const existing = await db.attemptAnswer.findFirst({
    where: { attemptId: params.attemptId, questionId },
  })

  if (existing) {
    await db.attemptAnswer.update({ where: { id: existing.id }, data: { answer } })
  } else {
    await db.attemptAnswer.create({
      data: { attemptId: params.attemptId, questionId, answer },
    })
  }

  return NextResponse.json({ success: true })
}
