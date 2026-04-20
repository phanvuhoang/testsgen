import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/gameshow/[shareCode]/session/[roomCode]/events
// Server-Sent Events for real-time state sync
export async function GET(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      
      // Poll DB every 1.5s and send updates
      let lastState = ''
      let count = 0
      const maxPolls = 400 // ~10 minutes
      
      const poll = async () => {
        try {
          const session = await db.gameshowSession.findFirst({
            where: { roomCode: params.roomCode },
            include: {
              players: { orderBy: { score: 'desc' } }
            }
          })
          
          if (!session) {
            send({ type: 'error', message: 'Session not found' })
            controller.close()
            return
          }
          
          const currentState = JSON.stringify({
            status: session.status,
            gameState: session.gameState,
            players: session.players,
          })
          
          if (currentState !== lastState) {
            lastState = currentState
            send({
              type: 'state',
              status: session.status,
              gameState: session.gameState ? JSON.parse(session.gameState) : null,
              players: session.players,
            })
          }
          
          if (session.status === 'FINISHED' || count >= maxPolls) {
            send({ type: 'finished' })
            controller.close()
            return
          }
          
          count++
          setTimeout(poll, 1500)
        } catch (e) {
          controller.close()
        }
      }
      
      send({ type: 'connected', roomCode: params.roomCode })
      setTimeout(poll, 500)
    }
  })
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
