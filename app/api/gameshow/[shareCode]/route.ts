import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/gameshow/[shareCode]
// Public route — no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  const gameshow = await db.gameshow.findFirst({
    where: { shareCode: params.shareCode },
    include: {
      quizSet: {
        include: {
          questions: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              stem: true,
              questionType: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              difficulty: true,
              points: true,
              topic: true,
              tags: true,
              sortOrder: true,
            }
          }
        }
      }
    }
  })
  
  if (!gameshow) return NextResponse.json({ error: 'Gameshow not found' }, { status: 404 })
  
  return NextResponse.json({
    id: gameshow.id,
    shareCode: gameshow.shareCode,
    name: gameshow.name,
    description: gameshow.description,
    type: gameshow.type,
    playMode: gameshow.playMode,
    selectionMode: gameshow.selectionMode,
    scoringMode: gameshow.scoringMode,
    timeLimitSeconds: gameshow.timeLimitSeconds,
    answerRevealSeconds: gameshow.answerRevealSeconds,
    responseSeconds: gameshow.responseSeconds,
    enableLifelines: gameshow.enableLifelines,
    lifelines: gameshow.lifelines,
    enableStreak: gameshow.enableStreak,
    streakBonus: gameshow.streakBonus,
    categoriesCount: gameshow.categoriesCount,
    tiersPerCategory: gameshow.tiersPerCategory,
    tierPoints: gameshow.tierPoints,
    maxPlayers: gameshow.maxPlayers,
    requireLogin: gameshow.requireLogin,
    shuffleQuestions: gameshow.shuffleQuestions,
    quizSetTitle: (gameshow as any).quizSet.title,
    questions: (gameshow as any).quizSet.questions,
  })
}
