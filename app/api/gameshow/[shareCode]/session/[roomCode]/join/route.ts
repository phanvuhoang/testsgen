import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'

// POST /api/gameshow/[shareCode]/session/[roomCode]/join
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const body = await req.json()
  const session = await auth()
  
  const gsSession = await db.gameshowSession.findFirst({
    where: { roomCode: params.roomCode },
    include: { gameshow: true, players: true }
  })
  if (!gsSession) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (gsSession.status === 'FINISHED') return NextResponse.json({ error: 'Game already finished' }, { status: 400 })
  if (gsSession.players.length >= gsSession.gameshow.maxPlayers) {
    return NextResponse.json({ error: 'Room is full' }, { status: 400 })
  }
  
  const player = await db.gameshowPlayer.create({
    data: {
      sessionId: gsSession.id,
      nickname: body.nickname || 'Guest',
      avatarColor: body.avatarColor || '#028a39',
      userId: session?.user?.id || null,
    }
  })
  
  return NextResponse.json({ player, session: gsSession })
}
