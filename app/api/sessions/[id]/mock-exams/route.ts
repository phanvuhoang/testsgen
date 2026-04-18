import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const exams = await db.mockExam.findMany({
    where: { sessionId: params.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { attempts: true } } },
  })
  return NextResponse.json(exams)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const exam = await db.mockExam.create({
    data: {
      sessionId: params.id,
      name: body.name,
      duration: body.duration || 120,
      instructions: body.instructions,
      passMark: body.passMark || 50,
      passMessage: body.passMessage,
      failMessage: body.failMessage,
      status: 'DRAFT',
      sections: {
        create: (body.sectionDraws || []).map((d: { sectionId: string; questionsToDrawCount: number }) => ({
          sectionId: d.sectionId,
          questionsToDrawCount: d.questionsToDrawCount,
        })),
      },
    },
    include: { _count: { select: { attempts: true } } },
  })
  return NextResponse.json(exam, { status: 201 })
}
