import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { unlink } from 'fs/promises'
import { join } from 'path'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await db.document.findUnique({ where: { id: params.docId } })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await unlink(join(process.cwd(), 'public', doc.filePath))
  } catch {}

  await db.document.delete({ where: { id: params.docId } })
  return NextResponse.json({ success: true })
}
