import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string; attemptId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attempt = await db.attempt.findFirst({
    where: { id: params.attemptId, quizSetId: params.id },
    include: {
      user: { select: { name: true, email: true } },
      answers: {
        include: {
          quizQuestion: {
            select: { id: true, stem: true, correctAnswer: true, explanation: true, questionType: true, options: true, points: true }
          }
        },
        orderBy: { id: 'asc' }
      }
    }
  })

  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(attempt)
}
