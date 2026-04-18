import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attempts = await db.attempt.findMany({
    where: { mockExamId: params.id },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startedAt: 'desc' },
  })

  // Compute stats
  const submitted = attempts.filter((a) => a.status !== 'IN_PROGRESS' && a.totalScore !== null && a.maxScore !== null)
  const avgScore = submitted.length
    ? submitted.reduce((sum, a) => sum + (a.totalScore! / a.maxScore!) * 100, 0) / submitted.length
    : 0

  const exam = await db.mockExam.findUnique({ where: { id: params.id }, select: { passMark: true } })
  const passRate = submitted.length
    ? (submitted.filter((a) => (a.totalScore! / a.maxScore!) * 100 >= (exam?.passMark || 50)).length / submitted.length) * 100
    : 0

  // Histogram buckets
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${(i + 1) * 10}%`,
    count: 0,
  }))
  submitted.forEach((a) => {
    const pct = (a.totalScore! / a.maxScore!) * 100
    const bucket = Math.min(9, Math.floor(pct / 10))
    histogram[bucket].count++
  })

  return NextResponse.json({
    attempts,
    stats: {
      totalAttempts: attempts.length,
      avgScore: Math.round(avgScore * 10) / 10,
      passRate: Math.round(passRate * 10) / 10,
      histogram,
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get mock exam with section configs
  const exam = await db.mockExam.findUnique({
    where: { id: params.id },
    include: { sections: true },
  })
  if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (exam.status !== 'PUBLISHED') return NextResponse.json({ error: 'Exam not published' }, { status: 400 })

  // Draw random approved questions from each section
  const drawnQuestions: {
    id: string
    stem: string
    questionType: string
    options: unknown
    marks: number
    sectionName: string
  }[] = []
  
  for (const secConfig of exam.sections) {
    const sectionQuestions = await db.question.findMany({
      where: { sectionId: secConfig.sectionId, status: 'APPROVED' },
      include: { section: { select: { name: true } } },
    })
    const shuffled = shuffleArray(sectionQuestions)
    const drawn = shuffled.slice(0, secConfig.questionsToDrawCount)
    drawnQuestions.push(...drawn.map((q) => ({
      id: q.id,
      stem: q.stem,
      questionType: q.questionType,
      options: q.options,
      marks: q.marks,
      sectionName: q.section.name,
    })))
  }

  const attempt = await db.attempt.create({
    data: {
      userId: session.user.id,
      mockExamId: params.id,
      status: 'IN_PROGRESS',
      questionsSnapshot: drawnQuestions,
    },
  })

  return NextResponse.json({
    attemptId: attempt.id,
    questions: drawnQuestions,
  }, { status: 201 })
}
