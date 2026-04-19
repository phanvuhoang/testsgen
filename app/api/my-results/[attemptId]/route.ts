import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only return the attempt if it belongs to the logged-in user
  const attempt = await db.attempt.findFirst({
    where: {
      id: params.attemptId,
      userId: session.user.id,
    },
    include: {
      quizSet: { select: { title: true, passMark: true, feedbackShowAnswer: true, feedbackShowExplanation: true } },
      answers: {
        include: {
          quizQuestion: {
            select: {
              stem: true,
              correctAnswer: true,
              explanation: true,
              questionType: true,
              options: true,
              points: true,
            }
          }
        },
        orderBy: { id: 'asc' }
      }
    }
  })

  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(attempt)
}
