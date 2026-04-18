import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string; mockId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const exam = await db.mockExam.findUnique({
    where: { id: params.mockId },
    include: { sections: { include: { section: true } } },
  })
  if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(exam)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; mockId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const exam = await db.mockExam.update({ where: { id: params.mockId }, data: body })
  return NextResponse.json(exam)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; mockId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.mockExam.delete({ where: { id: params.mockId } })
  return NextResponse.json({ success: true })
}
