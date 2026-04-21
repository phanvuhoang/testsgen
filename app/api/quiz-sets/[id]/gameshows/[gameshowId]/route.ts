import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'

// GET /api/quiz-sets/[id]/gameshows/[gameshowId]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; gameshowId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const gameshow = await db.gameshow.findFirst({
    where: { id: params.gameshowId, quizSetId: params.id },
    include: {
      quizSet: {
        include: {
          questions: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      sessions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          _count: { select: { players: true } }
        }
      }
    }
  })
  
  if (!gameshow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(gameshow)
}

// PATCH /api/quiz-sets/[id]/gameshows/[gameshowId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; gameshowId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await req.json()
  
  const updated = await db.gameshow.update({
    where: { id: params.gameshowId },
    data: {
      name: body.name,
      description: body.description,
      type: body.type,
      playMode: body.playMode,
      selectionMode: body.selectionMode,
      scoringMode: body.scoringMode,
      questionsCount: body.questionsCount != null ? parseInt(body.questionsCount) || null : undefined,
      timeLimitSeconds: body.timeLimitSeconds != null ? parseInt(body.timeLimitSeconds) : undefined,
      answerRevealSeconds: body.answerRevealSeconds != null ? parseInt(body.answerRevealSeconds) : undefined,
      responseSeconds: body.responseSeconds != null ? parseInt(body.responseSeconds) : undefined,
      enableLifelines: body.enableLifelines,
      lifelines: body.lifelines,
      enableStreak: body.enableStreak,
      streakBonus: body.streakBonus != null ? parseInt(body.streakBonus) : undefined,
      categoriesCount: body.categoriesCount != null ? parseInt(body.categoriesCount) : undefined,
      tiersPerCategory: body.tiersPerCategory != null ? parseInt(body.tiersPerCategory) : undefined,
      tierPoints: body.tierPoints,
      maxPlayers: body.maxPlayers != null ? parseInt(body.maxPlayers) : undefined,
      requireLogin: body.requireLogin,
      shuffleQuestions: body.shuffleQuestions,
      ...(body.showLeaderboard !== undefined ? { showLeaderboard: body.showLeaderboard } as any : {}),
      ...(body.clickStartToCount !== undefined ? { clickStartToCount: body.clickStartToCount } as any : {}),
      ...(body.buzzerMode !== undefined ? { buzzerMode: body.buzzerMode } as any : {}),
      ...(body.manualScoring !== undefined ? { manualScoring: body.manualScoring } as any : {}),
      ...(body.shortLink !== undefined ? { shortLink: body.shortLink } as any : {}),
      easyCount: body.easyCount != null ? parseInt(body.easyCount) || null : undefined,
      mediumCount: body.mediumCount != null ? parseInt(body.mediumCount) || null : undefined,
      hardCount: body.hardCount != null ? parseInt(body.hardCount) || null : undefined,
      fixedQuestionIds: body.fixedQuestionIds,
    }
  })
  return NextResponse.json(updated)
}

// DELETE /api/quiz-sets/[id]/gameshows/[gameshowId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; gameshowId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  await db.gameshow.delete({ where: { id: params.gameshowId } })
  return NextResponse.json({ success: true })
}
