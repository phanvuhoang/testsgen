import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { sendResultEmail } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { scoreType = 'score', attemptIds } = body // optional: specific attemptIds; if empty, send to all

  const whereIds = attemptIds?.length > 0 ? { id: { in: attemptIds } } : {}

  const attempts = await db.attempt.findMany({
    where: { quizSetId: params.id, status: { in: ['SUBMITTED', 'GRADED'] }, ...whereIds },
    include: {
      user: { select: { name: true, email: true } },
      quizSet: { select: { title: true, passMark: true } },
      answers: {
        include: {
          quizQuestion: { select: { stem: true, correctAnswer: true, explanation: true, questionType: true } }
        }
      }
    }
  })

  let sent = 0; let failed = 0
  for (const attempt of attempts) {
    const toEmail = attempt.user?.email || attempt.guestEmail
    if (!toEmail) { failed++; continue }
    const studentName = attempt.user?.name || attempt.guestName || 'Student'
    const pct = attempt.maxScore && attempt.maxScore > 0 ? Math.round((attempt.totalScore ?? 0) / attempt.maxScore * 100) : 0
    const passed = attempt.quizSet?.passMark != null ? pct >= attempt.quizSet.passMark : null
    try {
      await sendResultEmail({
        to: toEmail, studentName, quizTitle: attempt.quizSet?.title ?? 'Quiz',
        scoreType: scoreType as any, score: attempt.totalScore ?? 0, maxScore: attempt.maxScore ?? 0,
        pct, passed, passMark: attempt.quizSet?.passMark ?? 50,
        answers: scoreType !== 'score' ? attempt.answers.map(a => ({
          stem: a.quizQuestion?.stem ?? '', answer: a.answer ?? '',
          isCorrect: a.isCorrect, correctAnswer: a.quizQuestion?.correctAnswer ?? '',
          explanation: a.quizQuestion?.explanation ?? null, marksAwarded: a.marksAwarded
        })) : undefined
      })
      sent++
    } catch { failed++ }
  }
  return NextResponse.json({ sent, failed, total: attempts.length })
}
