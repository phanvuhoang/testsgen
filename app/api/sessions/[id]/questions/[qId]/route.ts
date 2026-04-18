import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const q = await db.question.update({
    where: { id: params.qId },
    data: body,
    include: { section: { select: { id: true, name: true } } },
  })
  return NextResponse.json(q)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.question.delete({ where: { id: params.qId } })
  return NextResponse.json({ success: true })
}
