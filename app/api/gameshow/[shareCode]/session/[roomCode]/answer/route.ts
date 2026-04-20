import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/gameshow/[shareCode]/session/[roomCode]/answer
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string; roomCode: string } }
) {
  const body = await req.json()
  // body: { playerId, questionId, answer, responseTimeMs, isCorrect, pointsEarned }
  
  const session = await db.gameshowSession.findFirst({
    where: { roomCode: params.roomCode }
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  
  const player = await db.gameshowPlayer.findFirst({
    where: { id: body.playerId, sessionId: session.id }
  })
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  
  // Update player score
  const prevAnswers = player.answers ? JSON.parse(player.answers) : []
  const newAnswer = {
    questionId: body.questionId,
    answer: body.answer,
    correct: body.isCorrect,
    pointsEarned: body.pointsEarned || 0,
    responseTimeMs: body.responseTimeMs || 0,
  }
  
  const newStreak = body.isCorrect ? player.streak + 1 : 0
  const newBestStreak = Math.max(player.bestStreak, newStreak)
  
  const updatedPlayer = await db.gameshowPlayer.update({
    where: { id: player.id },
    data: {
      score: player.score + (body.pointsEarned || 0),
      correctCount: body.isCorrect ? player.correctCount + 1 : player.correctCount,
      wrongCount: !body.isCorrect ? player.wrongCount + 1 : player.wrongCount,
      streak: newStreak,
      bestStreak: newBestStreak,
      answers: JSON.stringify([...prevAnswers, newAnswer]),
      lastSeenAt: new Date(),
    }
  })
  
  return NextResponse.json(updatedPlayer)
}
