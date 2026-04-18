import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { gradeWrittenAnswer } from '@/lib/ai'

export async function POST(req: NextRequest, { params }: { params: { id: string; attemptId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attempt = await db.attempt.findUnique({
    where: { id: params.attemptId },
    include: { answers: true },
  })
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const exam = await db.mockExam.findUnique({
    where: { id: params.id },
    select: { passMark: true, passMessage: true, failMessage: true },
  })

  const snapshot = attempt.questionsSnapshot as { id: string; questionType: string; marks: number }[]
  
  let totalScore = 0
  let maxScore = 0
  const gradingPromises: Promise<void>[] = []

  for (const snapQ of snapshot || []) {
    maxScore += snapQ.marks
    const answer = attempt.answers.find((a) => a.questionId === snapQ.id)

    if (snapQ.questionType === 'MCQ_SINGLE' || snapQ.questionType === 'MCQ_MULTIPLE') {
      // Auto-grade MCQ
      const q = await db.question.findUnique({ where: { id: snapQ.id }, select: { correctAnswer: true } })
      const isCorrect = answer?.answer === q?.correctAnswer
      const marks = isCorrect ? snapQ.marks : 0
      totalScore += marks

      if (answer) {
        await db.attemptAnswer.update({
          where: { id: answer.id },
          data: { isCorrect, marksAwarded: marks, gradedAt: new Date() },
        })
      }
    } else {
      // Written question — AI grade async
      gradingPromises.push(
        (async () => {
          const q = await db.question.findUnique({
            where: { id: snapQ.id },
            select: { stem: true, markingScheme: true, modelAnswer: true, marks: true },
          })
          if (!q || !answer?.answer) return

          const result = await gradeWrittenAnswer({
            stem: q.stem,
            markingScheme: q.markingScheme || '',
            modelAnswer: q.modelAnswer || '',
            studentAnswer: answer.answer,
            marks: q.marks,
          })

          await db.attemptAnswer.update({
            where: { id: answer.id },
            data: {
              isCorrect: result.marksAwarded >= q.marks,
              marksAwarded: result.marksAwarded,
              aiFeedback: result.feedback,
              gradedAt: new Date(),
            },
          })
        })()
      )
    }
  }

  const pct = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
  const passed = pct >= (exam?.passMark || 50)

  await db.attempt.update({
    where: { id: params.attemptId },
    data: {
      status: gradingPromises.length > 0 ? 'SUBMITTED' : 'GRADED',
      submittedAt: new Date(),
      totalScore,
      maxScore,
    },
  })

  // Grade written answers in background
  Promise.all(gradingPromises).then(async () => {
    await db.attempt.update({
      where: { id: params.attemptId },
      data: { status: 'GRADED' },
    })
  })

  return NextResponse.json({ totalScore, maxScore, pct: Math.round(pct), passed, passMessage: exam?.passMessage, failMessage: exam?.failMessage })
}
