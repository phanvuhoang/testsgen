import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const q = await db.question.findUnique({
    where: { id: params.qId },
    include: { section: { select: { id: true, name: true } } },
  })
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(q)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  try {
    const updated = await db.question.update({
      where: { id: params.qId },
      data: {
        ...(body.stem !== undefined ? { stem: body.stem } : {}),
        ...(body.options !== undefined ? { options: body.options } : {}),
        ...(body.correctAnswer !== undefined ? { correctAnswer: body.correctAnswer } : {}),
        ...(body.markingScheme !== undefined ? { markingScheme: body.markingScheme } : {}),
        ...(body.modelAnswer !== undefined ? { modelAnswer: body.modelAnswer } : {}),
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.difficulty !== undefined ? { difficulty: body.difficulty } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      include: { section: { select: { id: true, name: true } } },
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.question.delete({ where: { id: params.qId } })
  return NextResponse.json({ success: true })
}
