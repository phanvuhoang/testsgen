import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// GET /api/study-prep/available-sources
// Returns the Module 1 projects/sessions and Module 2 quiz sets the current
// user can use as sources for a new StudyPrepSet.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = session.user.role === 'ADMIN'
  const projectWhere = isAdmin ? {} : { createdById: session.user.id }
  const quizWhere    = isAdmin ? {} : { createdById: session.user.id }

  const [projects, quizSets] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        sessions: {
          select: {
            id: true,
            name: true,
            _count: { select: { documents: true, questions: true, parsedQuestions: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    db.quizSet.findMany({
      where: quizWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        _count: { select: { documents: true, questions: true } },
      },
    }),
  ])

  return NextResponse.json({ projects, quizSets })
}
