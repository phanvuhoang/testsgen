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
          }
        }
      }
    }
  })

  if (!gameshow) return NextResponse.json({ error: 'Gameshow not found' }, { status: 404 })

  const qs = (gameshow as any).quizSet?.questions ?? []

  // If fixedQuestionIds is set, filter to only those questions in that order
  let questions = qs
  if (gameshow.fixedQuestionIds) {
    try {
      const ids: string[] = JSON.parse(gameshow.fixedQuestionIds)
      const idMap = new Map(qs.map((q: any) => [q.id, q]))
      const fixed = ids.map((id: string) => idMap.get(id)).filter(Boolean)
      if (fixed.length > 0) questions = fixed
    } catch {}
  }

  // Strip sensitive fields — only expose needed fields
  const safeQuestions = questions.map((q: any) => ({
    id: q.id,
    stem: q.stem,
    questionType: q.questionType,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    difficulty: q.difficulty,
    points: q.points,
    topic: q.topic,
    tags: q.tags,
    sortOrder: q.sortOrder,
  }))

  return NextResponse.json({
    id: gameshow.id,
    shareCode: gameshow.shareCode,
    name: gameshow.name,
    description: gameshow.description,
    type: gameshow.type,
    playMode: gameshow.playMode,
    selectionMode: gameshow.selectionMode,
    scoringMode: gameshow.scoringMode,
    questionsCount: gameshow.questionsCount,
    fixedQuestionIds: gameshow.fixedQuestionIds,
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
    showLeaderboard: (gameshow as any).showLeaderboard ?? true,
    clickStartToCount: (gameshow as any).clickStartToCount ?? false,
    shortLink: (gameshow as any).shortLink ?? null,
    quizSetTitle: (gameshow as any).quizSet?.title ?? '',
    questions: safeQuestions,
  })
}
