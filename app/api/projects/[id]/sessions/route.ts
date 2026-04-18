import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessions = await db.session.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { documents: true, questions: true, mockExams: true } } },
  })
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const examSession = await db.session.create({
    data: {
      projectId: params.id,
      name: body.name,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    },
  })
  return NextResponse.json(examSession, { status: 201 })
}
