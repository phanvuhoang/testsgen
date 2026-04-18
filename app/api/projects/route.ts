import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(20),
  description: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = session.user.role === 'ADMIN' ? {} : { createdById: session.user.id }
  const projects = await db.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { sessions: true } }, createdBy: { select: { name: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'STUDENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const existing = await db.project.findUnique({ where: { code: data.code } })
    if (existing) return NextResponse.json({ error: 'Project code already exists' }, { status: 400 })

    const project = await db.project.create({
      data: { ...data, createdById: session.user.id },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
