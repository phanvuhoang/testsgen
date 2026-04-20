import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/gameshow/[shareCode]/session/[roomCode]
export async function GET(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const session = await db.gameshowSession.findFirst({
    where: { 
      roomCode: params.roomCode,
      gameshow: { shareCode: params.shareCode }
    },
    include: {
      gameshow: {
        include: {
          quizSet: {
            include: {
              questions: { orderBy: { sortOrder: 'asc' } }
            }
          }
        }
      },
      players: {
        orderBy: { score: 'desc' }
      }
    }
  })
  
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json(session)
}

// PATCH /api/gameshow/[shareCode]/session/[roomCode]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const body = await req.json()
  
  const session = await db.gameshowSession.findFirst({
    where: { roomCode: params.roomCode }
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  
  let newState = session.gameState ? JSON.parse(session.gameState) : {}
  
  // Merge state updates
  if (body.gameState) {
    newState = { ...newState, ...body.gameState }
  }
  
  const updated = await db.gameshowSession.update({
    where: { id: session.id },
    data: {
      gameState: JSON.stringify(newState),
      status: body.status || session.status,
    },
    include: { players: { orderBy: { score: 'desc' } } }
  })
  
  return NextResponse.json(updated)
}
