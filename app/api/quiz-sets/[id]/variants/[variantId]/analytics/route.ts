import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string; variantId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const attempts = await db.attempt.findMany({
      where: { variantId: params.variantId, status: { in: ['SUBMITTED', 'GRADED'] } },
      include: {
        user: { select: { name: true, email: true } },
        answers: {
          include: {
            quizQuestion: { select: { stem: true, correctAnswer: true, questionType: true } }
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    })

    const submitted = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'GRADED')
    const avgScore = submitted.length > 0
      ? Math.round(submitted.reduce((sum, a) => {
          const pct = a.maxScore && a.maxScore > 0 ? (a.totalScore ?? 0) / a.maxScore * 100 : 0
          return sum + pct
        }, 0) / submitted.length)
      : null

    return NextResponse.json({
      attempts: attempts.map(a => ({
        id: a.id,
        guestName: a.guestName,
        guestEmail: a.guestEmail,
        user: a.user,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        totalScore: a.totalScore,
        maxScore: a.maxScore,
        status: a.status,
        answers: a.answers
      })),
      stats: {
        total: attempts.length,
        submitted: submitted.length,
        avgScore
      }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
