import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// POST /api/gameshow/[shareCode]/session — create a new session
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  const gameshow = await db.gameshow.findFirst({
    where: { shareCode: params.shareCode },
    include: { quizSet: { include: { questions: true } } }
  })
  if (!gameshow) return NextResponse.json({ error: 'Gameshow not found' }, { status: 404 })
  
  const session = await auth()
  const body = await req.json()
  
  // Generate unique room code
  let roomCode = generateRoomCode()
  let attempts = 0
  while (attempts < 10) {
    const exists = await db.gameshowSession.findFirst({ where: { roomCode } })
    if (!exists) break
    roomCode = generateRoomCode()
    attempts++
  }
  
  // Build question order
  let questions = [...gameshow.quizSet.questions]
  if (gameshow.shuffleQuestions) {
    questions = questions.sort(() => Math.random() - 0.5)
  }
  if (gameshow.questionsCount && gameshow.questionsCount < questions.length) {
    questions = questions.slice(0, gameshow.questionsCount)
  }
  
  const questionOrder = questions.map(q => q.id)
  
  const gameState = JSON.stringify({
    currentQuestionIndex: 0,
    questionOrder,
    usedLifelines: {},
    startedAt: null,
    finishedAt: null,
    phase: 'lobby', // lobby | question | reveal | leaderboard | finished
    buzzedPlayers: [], // for online buzzer mode
  })
  
  const newSession = await db.gameshowSession.create({
    data: {
      gameshowId: gameshow.id,
      roomCode,
      status: 'WAITING',
      hostId: session?.user?.id || null,
      gameState,
    }
  })
  
  // For single/local: create players immediately from body
  if (body.players && Array.isArray(body.players)) {
    for (const p of body.players) {
      await db.gameshowPlayer.create({
        data: {
          sessionId: newSession.id,
          nickname: p.nickname || 'Player',
          avatarColor: p.avatarColor || '#028a39',
          userId: session?.user?.id || null,
        }
      })
    }
  }
  
  const fullSession = await db.gameshowSession.findFirst({
    where: { id: newSession.id },
    include: { players: true }
  })
  
  return NextResponse.json(fullSession, { status: 201 })
}
