import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string; classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const attempts = await db.attempt.findMany({
      where: { quizClassId: params.classId },
      include: {
        user: { select: { name: true, email: true } },
        answers: {
          include: {
            quizQuestion: { select: { stem: true, correctAnswer: true, questionType: true } }
          }
        }
      },
      orderBy: { startedAt: 'desc' }
    })

    const submitted = attempts.filter(a => ['SUBMITTED', 'GRADED'].includes(a.status))
    const avgScore = submitted.length > 0
      ? Math.round(submitted.reduce((s, a) => s + (a.maxScore ? (a.totalScore ?? 0) / a.maxScore * 100 : 0), 0) / submitted.length)
      : null

    return NextResponse.json({ attempts, stats: { total: attempts.length, submitted: submitted.length, avgScore } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
