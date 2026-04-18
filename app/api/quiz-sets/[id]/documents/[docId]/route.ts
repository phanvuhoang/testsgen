import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { unlink } from 'fs/promises'
import { join } from 'path'

// DELETE /api/quiz-sets/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await db.quizDocument.findFirst({
    where: { id: params.docId, quizSetId: params.id },
    include: { quizSet: { select: { createdById: true } } },
  })

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only owner or admin can delete
  if (session.user.role !== 'ADMIN' && doc.quizSet.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Try to remove file from disk
  try {
    await unlink(join(process.cwd(), 'public', doc.filePath))
  } catch {
    // File may not exist on disk — continue anyway
  }

  await db.quizDocument.delete({ where: { id: params.docId } })
  return NextResponse.json({ success: true })
}
