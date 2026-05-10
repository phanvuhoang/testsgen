import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

async function loadSet(id: string, userId: string, role: string) {
  const set = await db.studyPrepSet.findUnique({
    where: { id },
    include: {
      session: {
        include: {
          project: { select: { id: true, name: true, createdById: true } },
          documents: {
            select: { id: true, fileName: true, fileType: true, fileSize: true, uploadedAt: true, isManualInput: true },
            orderBy: { uploadedAt: 'asc' },
          },
          topics: { select: { id: true, name: true, isOverall: true } },
          _count: {
            select: { questions: true, parsedQuestions: true, mockExams: true, sections: true },
          },
        },
      },
      quizSet: {
        include: {
          documents: {
            select: { id: true, fileName: true, fileType: true, fileSize: true, uploadedAt: true },
            orderBy: { uploadedAt: 'asc' },
          },
          _count: { select: { questions: true } },
        },
      },
      studyPlans: { orderBy: { updatedAt: 'desc' } },
      studyMaterials: { orderBy: { updatedAt: 'desc' } },
      mockExamPlans: { orderBy: { updatedAt: 'desc' } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  if (!set) return null
  if (role !== 'ADMIN' && set.createdById !== userId) return 'forbidden' as const
  return set
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const set = await loadSet(params.id, session.user.id, session.user.role)
  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (set === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(set)
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  targetExam: z.string().optional().nullable(),
  examDate: z.string().optional().nullable(),
  targetScore: z.string().optional().nullable(),
  weeklyHours: z.number().int().positive().optional().nullable(),
  language: z.string().optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db.studyPrepSet.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existing.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  const updated = await db.studyPrepSet.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.targetExam !== undefined ? { targetExam: body.targetExam } : {}),
      ...(body.examDate !== undefined
        ? { examDate: body.examDate ? new Date(body.examDate) : null }
        : {}),
      ...(body.targetScore !== undefined ? { targetScore: body.targetScore } : {}),
      ...(body.weeklyHours !== undefined ? { weeklyHours: body.weeklyHours } : {}),
      ...(body.language !== undefined ? { language: body.language ?? 'en' } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db.studyPrepSet.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role !== 'ADMIN' && existing.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.studyPrepSet.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
