import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/gameshow/[shareCode]/session/[roomCode]/answer
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const body = await req.json()
  // body: { playerId, questionId, answer, responseTimeMs, isCorrect, pointsEarned, bet? }

  const session = await db.gameshowSession.findFirst({
    where: { roomCode: params.roomCode },
    include: { gameshow: true }
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const player = await db.gameshowPlayer.findFirst({
    where: { id: body.playerId, sessionId: session.id }
  })
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // BUZZ mode: check if someone already buzzed this question
  const isBuzzMode = (session.gameshow as any).playMode === 'BUZZ'
  if (isBuzzMode) {
    let gs: any = {}
    try { gs = session.gameState ? JSON.parse(session.gameState) : {} } catch {}
    if (gs.buzzState && gs.buzzState.playerId !== body.playerId) {
      // Someone else already buzzed — reject
      return NextResponse.json({ ok: false, reason: 'already_buzzed' })
    }
    if (!gs.buzzState || gs.buzzState.playerId === body.playerId) {
      // Set buzzState in gameState (first to answer wins the buzz)
      const newGs = {
        ...gs,
        buzzState: {
          playerId: body.playerId,
          playerNickname: player.nickname,
          answer: body.answer,
          isCorrect: body.isCorrect,
          pts: body.pointsEarned || 0,
        }
      }
      await db.gameshowSession.update({
        where: { id: session.id },
        data: { gameState: JSON.stringify(newGs) }
      })
    }
  }

  // Update player score
  const prevAnswers = player.answers ? JSON.parse(player.answers) : []
  const newAnswer = {
    questionId: body.questionId,
    answer: body.answer,
    correct: body.isCorrect,
    pointsEarned: body.pointsEarned || 0,
    responseTimeMs: body.responseTimeMs || 0,
    bet: body.bet ?? false,
  }

  const newStreak = body.isCorrect ? player.streak + 1 : 0
  const newBestStreak = Math.max((player as any).bestStreak ?? 0, newStreak)
  const pts = body.pointsEarned || 0

  const updatedPlayer = await db.gameshowPlayer.update({
    where: { id: player.id },
    data: {
      score: player.score + pts,
      correctCount: body.isCorrect ? player.correctCount + 1 : player.correctCount,
      wrongCount: !body.isCorrect ? player.wrongCount + 1 : player.wrongCount,
      streak: newStreak,
      bestStreak: newBestStreak,
      answers: JSON.stringify([...prevAnswers, newAnswer]),
      lastSeenAt: new Date(),
      ...({ lastPointsEarned: pts } as any),
    }
  })

  return NextResponse.json({ ...updatedPlayer, ok: true })
}
