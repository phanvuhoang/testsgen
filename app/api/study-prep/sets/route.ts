import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

// GET /api/study-prep/sets — list all StudyPrepSets visible to the current user
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where =
    session.user.role === 'ADMIN'
      ? {}
      : { createdById: session.user.id }

  const sets = await db.studyPrepSet.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      session: { select: { id: true, name: true, project: { select: { name: true, id: true } } } },
      quizSet: { select: { id: true, title: true } },
      createdBy: { select: { id: true, name: true } },
      _count: {
        select: { studyPlans: true, studyMaterials: true, mockExamPlans: true },
      },
    },
  })

  return NextResponse.json(sets)
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  quizSetId: z.string().optional().nullable(),
  targetExam: z.string().optional().nullable(),
  examDate: z.string().optional().nullable(),
  targetScore: z.string().optional().nullable(),
  weeklyHours: z.number().int().positive().optional().nullable(),
  language: z.string().optional().nullable(),
})

// POST /api/study-prep/sets — create a new StudyPrepSet
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role === 'STUDENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof createSchema>
  try {
    const body = await req.json()
    parsed = createSchema.parse(body)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  if (!parsed.sessionId && !parsed.quizSetId) {
    return NextResponse.json(
      { error: 'Pick at least one source: a Module 1 session or a Module 2 quiz set.' },
      { status: 400 }
    )
  }

  // Validate ownership of linked sources (non-admins can only link to their own)
  if (parsed.sessionId) {
    const sess = await db.session.findUnique({
      where: { id: parsed.sessionId },
      include: { project: true },
    })
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (
      session.user.role !== 'ADMIN' &&
      sess.project.createdById !== session.user.id
    ) {
      return NextResponse.json({ error: 'Forbidden — you do not own this session' }, { status: 403 })
    }
  }
  if (parsed.quizSetId) {
    const qs = await db.quizSet.findUnique({ where: { id: parsed.quizSetId } })
    if (!qs) return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 })
    if (
      session.user.role !== 'ADMIN' &&
      qs.createdById !== session.user.id
    ) {
      return NextResponse.json({ error: 'Forbidden — you do not own this quiz set' }, { status: 403 })
    }
  }

  const set = await db.studyPrepSet.create({
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      sessionId: parsed.sessionId ?? null,
      quizSetId: parsed.quizSetId ?? null,
      targetExam: parsed.targetExam ?? null,
      examDate: parsed.examDate ? new Date(parsed.examDate) : null,
      targetScore: parsed.targetScore ?? null,
      weeklyHours: parsed.weeklyHours ?? null,
      language: parsed.language ?? 'en',
      createdById: session.user.id,
    },
  })

  return NextResponse.json(set, { status: 201 })
}
