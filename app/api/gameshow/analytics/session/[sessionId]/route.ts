import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { sessionId: string } }) {
  try {
    await db.gameshowSession.delete({ where: { id: params.sessionId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[delete session]', e)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
