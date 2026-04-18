import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const sec = await db.examSection.update({ where: { id: params.sectionId }, data: body })
  return NextResponse.json(sec)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; sectionId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.examSection.delete({ where: { id: params.sectionId } })
  return NextResponse.json({ success: true })
}
