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

  // Draw approved questions from each section, respecting topic/type breakdown if set
  const drawnQuestions: {
    id: string
    stem: string
    questionType: string
    options: unknown
    marks: number
    sectionName: string
  }[] = []

  function mapQ(q: any) {
    return { id: q.id, stem: q.stem, questionType: q.questionType, options: q.options, marks: q.marks, sectionName: q.section.name }
  }

  for (const secConfig of exam.sections) {
    const baseWhere = { sectionId: secConfig.sectionId, status: 'APPROVED' as const }
    const topicBreakdown: { topicName: string; count: number }[] | null =
      (secConfig as any).topicBreakdown ? JSON.parse((secConfig as any).topicBreakdown) : null
    const questionTypes: { type: string; count: number }[] | null =
      (secConfig as any).questionTypes ? JSON.parse((secConfig as any).questionTypes) : null

    if (topicBreakdown && topicBreakdown.length > 0) {
      // Draw per topic
      for (const tb of topicBreakdown) {
        const qs = await db.question.findMany({ where: { ...baseWhere, topic: tb.topicName }, include: { section: { select: { name: true } } } })
        drawnQuestions.push(...shuffleArray(qs).slice(0, tb.count).map(mapQ))
      }
    } else if (questionTypes && questionTypes.length > 0) {
      // Draw per question type
      for (const qt of questionTypes) {
        const qs = await db.question.findMany({ where: { ...baseWhere, questionType: qt.type as any }, include: { section: { select: { name: true } } } })
        drawnQuestions.push(...shuffleArray(qs).slice(0, qt.count).map(mapQ))
      }
    } else {
      // Random draw (default)
      const qs = await db.question.findMany({ where: baseWhere, include: { section: { select: { name: true } } } })
      drawnQuestions.push(...shuffleArray(qs).slice(0, secConfig.questionsToDrawCount).map(mapQ))
    }
  }

  const attempt = await db.attempt.create({
    data: {
      userId: session.user.id,
      mockExamId: params.id,
      status: 'IN_PROGRESS',
      questionsSnapshot: drawnQuestions as any,
    },
  })

  return NextResponse.json({
    attemptId: attempt.id,
    questions: drawnQuestions,
  }, { status: 201 })
}
