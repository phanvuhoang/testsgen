import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { sendResultEmail } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string; attemptId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { scoreType = 'score', recipientEmail } = body // scoreType: 'score' | 'analytics' | 'comprehensive'

  const attempt = await db.attempt.findFirst({
    where: { id: params.attemptId, quizSetId: params.id },
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

  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const toEmail = recipientEmail || attempt.user?.email || attempt.guestEmail
  if (!toEmail) return NextResponse.json({ error: 'No email address available for this student' }, { status: 400 })

  const studentName = attempt.user?.name || attempt.guestName || 'Student'
  const pct = attempt.maxScore && attempt.maxScore > 0 ? Math.round((attempt.totalScore ?? 0) / attempt.maxScore * 100) : 0
  const passed = attempt.quizSet?.passMark != null ? pct >= attempt.quizSet.passMark : null

  try {
    await sendResultEmail({
      to: toEmail,
      studentName,
      quizTitle: attempt.quizSet?.title ?? 'Quiz',
      scoreType: scoreType as any,
      score: attempt.totalScore ?? 0,
      maxScore: attempt.maxScore ?? 0,
      pct,
      passed,
      passMark: attempt.quizSet?.passMark ?? 50,
      answers: scoreType !== 'score' ? attempt.answers.map(a => ({
        stem: a.quizQuestion?.stem ?? '',
        answer: a.answer ?? '',
        isCorrect: a.isCorrect,
        correctAnswer: a.quizQuestion?.correctAnswer ?? '',
        explanation: a.quizQuestion?.explanation ?? null,
        marksAwarded: a.marksAwarded
      })) : undefined
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: 'Failed to send email: ' + String(err) }, { status: 500 })
  }
}
