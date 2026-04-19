import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// DELETE /api/quiz-sets/[id]/attempts/delete
// Body: { attemptIds: string[] }
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'TEACHER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { attemptIds } = body as { attemptIds: string[] }

  if (!attemptIds || attemptIds.length === 0) {
    return NextResponse.json({ error: 'No attempt IDs provided' }, { status: 400 })
  }

  // Verify these attempts belong to this quiz set
  const deleted = await db.attempt.deleteMany({
    where: {
      id: { in: attemptIds },
      quizSetId: params.id,
    }
  })

  return NextResponse.json({ deleted: deleted.count })
}
