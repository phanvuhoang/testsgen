import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'

// GET /api/quiz-sets/[id]/gameshows
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const gameshows = await db.gameshow.findMany({
    where: { quizSetId: params.id },
    include: {
      _count: { select: { sessions: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
  return NextResponse.json(gameshows)
}

// POST /api/quiz-sets/[id]/gameshows
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await req.json()
  const gameshow = await db.gameshow.create({
    data: {
      quizSetId: params.id,
      name: body.name || 'New Gameshow',
      description: body.description || null,
      type: body.type || 'KAHOOT',
      playMode: body.playMode || 'SINGLE',
      selectionMode: body.selectionMode || 'LINEAR',
      scoringMode: body.scoringMode || 'SPEED_ACCURACY',
      questionsCount: body.questionsCount ? parseInt(body.questionsCount) : null,
      fixedQuestionIds: body.fixedQuestionIds ?? null,
      timeLimitSeconds: body.timeLimitSeconds ? parseInt(body.timeLimitSeconds) : 30,
      answerRevealSeconds: body.answerRevealSeconds ? parseInt(body.answerRevealSeconds) : 4,
      responseSeconds: body.responseSeconds ? parseInt(body.responseSeconds) : 10,
      enableLifelines: body.enableLifelines ?? true,
      lifelines: body.lifelines ?? '["5050","phone","audience"]',
      enableStreak: body.enableStreak ?? true,
      streakBonus: body.streakBonus ? parseInt(body.streakBonus) : 50,
      categoriesCount: body.categoriesCount ? parseInt(body.categoriesCount) : 5,
      tiersPerCategory: body.tiersPerCategory ? parseInt(body.tiersPerCategory) : 5,
      tierPoints: body.tierPoints ?? '[10,25,50,100,200]',
      categoryNames: body.categoryNames || null,
      jeopardyTags: body.jeopardyTags || null,
      maxPlayers: body.maxPlayers ? parseInt(body.maxPlayers) : 4,
      requireLogin: body.requireLogin ?? false,
      shuffleQuestions: body.shuffleQuestions ?? true,
      ...(body.showLeaderboard !== undefined ? { showLeaderboard: body.showLeaderboard } as any : {}),
      ...(body.clickStartToCount !== undefined ? { clickStartToCount: body.clickStartToCount } as any : {}),
      ...(body.buzzerMode !== undefined ? { buzzerMode: body.buzzerMode } as any : {}),
      ...(body.buzzButton !== undefined ? { buzzButton: body.buzzButton } as any : {}),
      ...(body.manualScoring !== undefined ? { manualScoring: body.manualScoring } as any : {}),
      ...(body.betEnabled !== undefined ? { betEnabled: body.betEnabled } as any : {}),
      ...(body.betTimes !== undefined ? { betTimes: parseInt(body.betTimes) || 1 } as any : {}),
      ...(body.betMultiple !== undefined ? { betMultiple: parseFloat(body.betMultiple) || 2.0 } as any : {}),
      ...(body.betWrongAnswer !== undefined ? { betWrongAnswer: body.betWrongAnswer } as any : {}),
      shortLink: body.shortLink ?? null,
      ...(body.coverImage !== undefined ? { coverImage: body.coverImage } as any : {}),
      easyCount: body.easyCount ? parseInt(body.easyCount) : null,
      mediumCount: body.mediumCount ? parseInt(body.mediumCount) : null,
      hardCount: body.hardCount ? parseInt(body.hardCount) : null,
    }
  })
  return NextResponse.json(gameshow, { status: 201 })
}
