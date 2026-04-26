import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/gameshow/[shareCode]/session/[roomCode]/buzz
// Called when a player presses the Buzz button (buzzButton mode only)
// Sets buzzState.isBuzzing = true; first caller wins
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const body = await req.json()
  // body: { playerId }

  const session = await db.gameshowSession.findFirst({
    where: { roomCode: params.roomCode }
  })
  if (!session) return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })

  const player = await db.gameshowPlayer.findFirst({
    where: { id: body.playerId, sessionId: session.id }
  })
  if (!player) return NextResponse.json({ ok: false, error: 'Player not found' }, { status: 404 })

  let gs: any = {}
  try { gs = session.gameState ? JSON.parse(session.gameState) : {} } catch {}

  // If someone already buzzed, reject
  if (gs.buzzState) {
    return NextResponse.json({ ok: false, reason: 'already_buzzed', buzzedBy: gs.buzzState.playerNickname })
  }

  // Set buzzing state (no answer yet)
  const newGs = {
    ...gs,
    buzzState: {
      playerId: body.playerId,
      playerNickname: player.nickname,
      answer: null,
      isCorrect: null,
      pts: 0,
      isBuzzing: true,
    }
  }

  await db.gameshowSession.update({
    where: { id: session.id },
    data: { gameState: JSON.stringify(newGs) }
  })

  return NextResponse.json({ ok: true, playerNickname: player.nickname })
}
