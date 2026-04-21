import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/gameshow/analytics
// Records a single player answer event for a gameshow session (fire-and-forget style)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { gameshowId, gameType, playerNickname, questionId, answer, correct, points, elapsedMs } = body

    if (!gameshowId || !questionId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    // Find or create today's anonymous session for analytics tracking
    // We use a "ANALYTICS" status to distinguish these lightweight tracking sessions
    let session = await db.gameshowSession.findFirst({
      where: {
        gameshowId,
        status: 'WAITING',
        // Sessions created in the last 4 hours (ongoing game window)
        createdAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })

    // If no active session found, create one
    if (!session) {
      const roomCode = `ANA${Date.now().toString(36).toUpperCase()}`
      session = await db.gameshowSession.create({
        data: {
          gameshowId,
          roomCode,
          status: 'WAITING',
          gameState: JSON.stringify({ gameType, startedAt: new Date().toISOString() }),
        },
      })
    }

    // Find or create player record
    let player = await db.gameshowPlayer.findFirst({
      where: { sessionId: session.id, nickname: playerNickname ?? 'Guest' },
    })
    if (!player) {
      player = await db.gameshowPlayer.create({
        data: {
          sessionId: session.id,
          nickname: playerNickname ?? 'Guest',
          avatarColor: '#028a39',
        },
      })
    }

    // Append this answer to the player's answers JSON
    let answers: any[] = []
    try { if (player.answers) answers = JSON.parse(player.answers) } catch {}
    answers.push({ questionId, answer, correct, points: points ?? 0, elapsedMs: elapsedMs ?? 0, timestamp: Date.now() })

    // Update player stats
    await db.gameshowPlayer.update({
      where: { id: player.id },
      data: {
        score: { increment: points ?? 0 },
        correctCount: correct ? { increment: 1 } : undefined,
        wrongCount: !correct ? { increment: 1 } : undefined,
        answers: JSON.stringify(answers),
        lastSeenAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    // Analytics should never crash the game — swallow all errors
    console.error('[analytics]', e)
    return NextResponse.json({ ok: false })
  }
}

// GET /api/gameshow/analytics?gameshowId=xxx
// Returns aggregated analytics for a gameshow (for the host)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const gameshowId = searchParams.get('gameshowId')
  if (!gameshowId) return NextResponse.json({ error: 'Missing gameshowId' }, { status: 400 })

  const sessions = await db.gameshowSession.findMany({
    where: { gameshowId },
    include: { players: true },
    orderBy: { createdAt: 'desc' },
  })

  const result = sessions.map(s => ({
    sessionId: s.id,
    roomCode: s.roomCode,
    status: s.status,
    createdAt: s.createdAt,
    players: s.players.map(p => ({
      nickname: p.nickname,
      score: p.score,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
      answers: (() => { try { return JSON.parse(p.answers ?? '[]') } catch { return [] } })(),
    })),
    leaderboard: [...s.players].sort((a, b) => b.score - a.score).slice(0, 10).map((p, rank) => ({
      rank: rank + 1,
      nickname: p.nickname,
      score: p.score,
      correctCount: p.correctCount,
    })),
  }))

  return NextResponse.json({ sessions: result, total: sessions.length })
}
